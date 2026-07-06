import { describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { Envelope } from '@core/crypto/envelope.ts'
import type {
  Repository,
  RepositorySnapshot,
  TombstoneRecord,
} from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { createNote } from '../../modules/notes/model.ts'
import { createNoteRepository } from '../../modules/notes/noteRepository.ts'
import { createSyncService } from './syncService.ts'
import { winner, type SyncItem } from './syncEngine.ts'
import type { SyncTarget } from './syncTarget.ts'

const KEY = new Uint8Array(32).fill(7)

/** Фейковая крипта: identity (ct = открытый текст) — достаточно для проверки потока. */
const crypto: CryptoService = {
  randomKey: () => new Uint8Array(32).fill(7),
  randomBytes: (n) => new Uint8Array(n).fill(1),
  encrypt: (_key, plaintext) => ({
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: new Uint8Array(24),
    ct: plaintext.slice(),
  }),
  decrypt: (_key, env) => env.ct.slice(),
  wipe: (bytes) => bytes.fill(0),
}

const vault = { requireKey: () => KEY } as unknown as VaultService

function makeRepo(): Repository {
  const blobs = new Map<string, Envelope>()
  const manifests = new Map<string, Envelope>()
  const tombstones = new Map<string, number>()
  let meta: RepositorySnapshot['meta'] | undefined
  const k = (c: string, id: string): string => `${c}/${id}`
  return {
    putBlob: (c, id, b) => {
      blobs.set(k(c, id), b)
      return Promise.resolve()
    },
    getBlob: (c, id) => Promise.resolve(blobs.get(k(c, id))),
    deleteBlob: (c, id) => {
      blobs.delete(k(c, id))
      return Promise.resolve()
    },
    listBlobIds: (c) =>
      Promise.resolve(
        [...blobs.keys()].filter((x) => x.startsWith(`${c}/`)).map((x) => x.slice(c.length + 1)),
      ),
    listCollections: () =>
      Promise.resolve([...new Set([...blobs.keys()].map((x) => x.split('/')[0]!))]),
    putManifest: (c, b) => {
      manifests.set(c, b)
      return Promise.resolve()
    },
    getManifest: (c) => Promise.resolve(manifests.get(c)),
    writeBlobWithManifest: (c, id, b, m) => {
      blobs.set(k(c, id), b)
      manifests.set(c, m)
      tombstones.delete(k(c, id))
      return Promise.resolve()
    },
    deleteBlobWithManifest: (c, id, m, tombstoneAt) => {
      blobs.delete(k(c, id))
      manifests.set(c, m)
      tombstones.set(k(c, id), tombstoneAt)
      return Promise.resolve()
    },
    listTombstones: () =>
      Promise.resolve(
        [...tombstones.entries()].map(([key, updatedAt]): TombstoneRecord => {
          const slash = key.indexOf('/')
          return {
            collection: key.slice(0, slash),
            id: key.slice(slash + 1),
            updatedAt,
          }
        }),
      ),
    putTombstone: (t) => {
      tombstones.set(k(t.collection, t.id), t.updatedAt)
      return Promise.resolve()
    },
    deleteTombstone: (c, id) => {
      tombstones.delete(k(c, id))
      return Promise.resolve()
    },
    readVaultMeta: () => Promise.resolve(meta),
    writeVaultMeta: (m) => {
      meta = m
      return Promise.resolve()
    },
    clearAll: () => {
      blobs.clear()
      manifests.clear()
      tombstones.clear()
      return Promise.resolve()
    },
    replaceAll: (s) => {
      blobs.clear()
      manifests.clear()
      tombstones.clear()
      meta = s.meta
      return Promise.resolve()
    },
    close: () => Promise.resolve(),
  }
}

/** In-memory «сервер» синхронизации: LWW-корзина с версией, общая для устройств. */
function makeServer(): SyncTarget {
  const items = new Map<string, SyncItem>()
  let meta: string | null = null
  let ver: string | null = null
  let verCounter = 0
  return {
    pull: () => Promise.resolve({ meta, items: [...items.values()], ver }),
    push: (m, incoming) => {
      let changed = 0
      for (const inc of incoming) {
        const key = `${inc.collection}/${inc.id}`
        const ex = items.get(key)
        if (!ex || winner(ex, inc) !== ex) {
          items.set(key, inc)
          changed += 1
        }
      }
      if (m !== null && m !== meta) {
        meta = m
        changed += 1
      }
      if (changed > 0 || ver === null) {
        verCounter += 1
        ver = `v${String(verCounter)}`
      }
      return Promise.resolve({ applied: incoming.length, ver })
    },
    version: () => Promise.resolve(ver),
  }
}

function device(server: SyncTarget): {
  notes: ReturnType<typeof createNoteRepository>
  sync: ReturnType<typeof createSyncService>
} {
  const repository = makeRepo()
  const notes = createNoteRepository({ repository, crypto, vault })
  const sync = createSyncService({
    repository,
    crypto,
    vault,
    collections: [{ name: 'notes', reindex: () => notes.reindex().then(() => undefined) }],
    target: server,
  })
  return { notes, sync }
}

describe('syncService (два устройства через общий сервер)', () => {
  it('заметка с A появляется на B', async () => {
    const server = makeServer()
    const a = device(server)
    const b = device(server)

    const note = createNote()
    await a.notes.save({ ...note, title: 'Привет с A' })
    await a.sync.syncNow()

    await b.sync.bootstrap()
    await b.sync.syncNow()

    const titlesB = (await b.notes.listIndex()).map((e) => e.title)
    expect(titlesB).toEqual(['Привет с A'])
  })

  it('правка на B доезжает обратно на A (сходимость)', async () => {
    const server = makeServer()
    const a = device(server)
    const b = device(server)

    const note = createNote()
    await a.notes.save({ ...note, title: 'v1' })
    await a.sync.syncNow()
    await b.sync.bootstrap()
    await b.sync.syncNow()

    const onB = await b.notes.get(note.id)
    await b.notes.save({ ...onB!, title: 'v2', updatedAt: Date.now() + 5000 })
    await b.sync.syncNow()
    await a.sync.syncNow()

    const onA = await a.notes.get(note.id)
    expect(onA?.title).toBe('v2')
  })

  it('идемпотентность: повторный syncNow ничего не применяет и не шлёт', async () => {
    const server = makeServer()
    const a = device(server)
    await a.notes.save({ ...createNote(), title: 'x' })
    await a.sync.syncNow()
    const second = await a.sync.syncNow()
    expect(second.appliedLocal).toBe(0)
    expect(second.pushed).toBe(0)
  })

  it('удаление не воскресает на удалившем устройстве (надгробие бьёт сервер)', async () => {
    const server = makeServer()
    const a = device(server)
    const note = createNote()
    await a.notes.save({ ...note, title: 'обречена' })
    await a.sync.syncNow() // копия ушла на сервер

    await a.notes.remove(note.id)
    await a.sync.syncNow() // раньше сервер возвращал запись — теперь надгробие побеждает

    expect(await a.notes.listIndex()).toEqual([])
    const again = await a.sync.syncNow()
    expect(again.appliedLocal).toBe(0) // сходимость: ничего не «доезжает» повторно
  })

  it('удаление с A доезжает до B', async () => {
    const server = makeServer()
    const a = device(server)
    const b = device(server)

    const note = createNote()
    await a.notes.save({ ...note, title: 'на обоих' })
    await a.sync.syncNow()
    await b.sync.bootstrap()
    await b.sync.syncNow()
    expect((await b.notes.listIndex())).toHaveLength(1)

    await a.notes.remove(note.id)
    await a.sync.syncNow()
    await b.sync.syncNow()

    expect(await b.notes.listIndex()).toEqual([])
    expect(await b.notes.get(note.id)).toBeUndefined()
  })

  it('версия корзины: syncNow возвращает актуальную, remoteVersion совпадает', async () => {
    const server = makeServer()
    const a = device(server)
    await a.notes.save({ ...createNote(), title: 'x' })
    const first = await a.sync.syncNow()
    expect(first.ver).not.toBeNull()
    expect(await a.sync.remoteVersion()).toBe(first.ver)
    // Пустой цикл ничего не меняет — версия стабильна (тик может её кэшировать).
    const second = await a.sync.syncNow()
    expect(second.ver).toBe(first.ver)
  })

  it('более новая правка воскрешает запись поверх устаревшего надгробия', async () => {
    const server = makeServer()
    const a = device(server)
    const b = device(server)

    const note = createNote()
    await a.notes.save({ ...note, title: 'v1' })
    await a.sync.syncNow()
    await b.sync.bootstrap()
    await b.sync.syncNow()

    await a.notes.remove(note.id) // удаление в момент T
    const onB = await b.notes.get(note.id)
    // Правка на B ПОЗЖЕ удаления — по LWW должна победить надгробие.
    await b.notes.save({ ...onB!, title: 'спасена', updatedAt: Date.now() + 60_000 })

    await a.sync.syncNow()
    await b.sync.syncNow()
    await a.sync.syncNow()

    const onA = await a.notes.get(note.id)
    expect(onA?.title).toBe('спасена')
    const titlesB = (await b.notes.listIndex()).map((e) => e.title)
    expect(titlesB).toEqual(['спасена'])
  })
})
