import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import type {
  Collection,
  Repository,
} from '@core/storage/repository.ts'
import {
  decodeVaultExport,
  encodeVaultExport,
} from '@core/transport/vaultExportCodec.ts'
import { createVaultService } from '@core/vault/vaultService.ts'
import type { VaultService } from '@core/vault/vaultState.ts'
import type { Envelope } from '@core/crypto/envelope.ts'
import type { VaultExport } from '@core/transport/transportTarget.ts'

import { createNote, type Note } from '../notes/model.ts'
import { createNoteRepository } from '../notes/noteRepository.ts'
import { buildVaultExport, restoreVaultExport } from './transfer.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }
const PASS = 'correct horse battery staple'

let crypto: CryptoService
let sodiumCache: Awaited<ReturnType<typeof loadSodium>>
let counter = 0

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

beforeEach(async () => {
  sodiumCache = await loadSodium()
  counter += 1
})

function makeVault(dbName: string): {
  repository: ReturnType<typeof createIdbRepository>
  vault: VaultService
} {
  const repository = createIdbRepository(dbName)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodiumCache),
    repo: repository,
    kdf: TEST_KDF,
  })
  return { repository, vault }
}

function note(title: string): Note {
  return { ...createNote(), title }
}

describe('export/import (DoD)', () => {
  it('экспорт → файл → импорт на другом волте → фраза → все заметки', async () => {
    const a = makeVault(`xfer-a-${String(counter)}`)
    await a.vault.setup(PASS)
    const notesA = createNoteRepository({ ...a, repository: a.repository, crypto, vault: a.vault })
    await notesA.save(note('Первая'))
    await notesA.save(note('Вторая'))

    const fileText = encodeVaultExport(await buildVaultExport(a.repository))
    const imported = decodeVaultExport(fileText)

    const b = makeVault(`xfer-b-${String(counter)}`)
    await restoreVaultExport(b.repository, imported)
    expect(await b.vault.initialize()).toBe('locked')
    await b.vault.unlockWithPassphrase(PASS)

    const notesB = createNoteRepository({ repository: b.repository, crypto, vault: b.vault })
    const titles = (await notesB.listIndex()).map((e) => e.title).sort()
    expect(titles).toEqual(['Вторая', 'Первая'])
  })

  it('экспорт без волта отклоняется', async () => {
    const a = makeVault(`xfer-empty-${String(counter)}`)
    await expect(buildVaultExport(a.repository)).rejects.toThrow()
  })

  it('импорт заменяет существующие данные (не смешивает)', async () => {
    const a = makeVault(`xfer-a2-${String(counter)}`)
    await a.vault.setup(PASS)
    await createNoteRepository({ repository: a.repository, crypto, vault: a.vault }).save(
      note('Из файла'),
    )
    const imported = decodeVaultExport(
      encodeVaultExport(await buildVaultExport(a.repository)),
    )

    const b = makeVault(`xfer-b2-${String(counter)}`)
    await b.vault.setup('another long passphrase here')
    await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).save(
      note('Старая B'),
    )

    await restoreVaultExport(b.repository, imported)
    await b.vault.initialize()
    await b.vault.unlockWithPassphrase(PASS)
    const titles = (
      await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).listIndex()
    ).map((e) => e.title)
    expect(titles).toEqual(['Из файла'])
  })

  it('импорт старого файла (v1) восстанавливает заметки', async () => {
    const a = makeVault(`xfer-v1-${String(counter)}`)
    await a.vault.setup(PASS)
    await createNoteRepository({ repository: a.repository, crypto, vault: a.vault }).save(
      note('Legacy'),
    )

    // превращаем v2-файл в v1-форму (как будто экспортировано старой версией)
    const raw = JSON.parse(
      encodeVaultExport(await buildVaultExport(a.repository)),
    ) as {
      magic: string
      meta: unknown
      collections: { manifest?: unknown; blobs: unknown[] }[]
    }
    const coll = raw.collections[0]
    const v1Text = JSON.stringify({
      magic: raw.magic,
      v: 1,
      meta: raw.meta,
      manifest: coll?.manifest,
      notes: coll?.blobs,
    })

    const b = makeVault(`xfer-v1b-${String(counter)}`)
    await restoreVaultExport(b.repository, decodeVaultExport(v1Text))
    await b.vault.initialize()
    await b.vault.unlockWithPassphrase(PASS)
    const titles = (
      await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).listIndex()
    ).map((e) => e.title)
    expect(titles).toEqual(['Legacy'])
  })
  it('импорт с недопустимым именем коллекции НЕ стирает текущий волт', async () => {
    const b = makeVault(`xfer-bad-${String(counter)}`)
    await b.vault.setup(PASS)
    await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).save(
      note('Цел'),
    )
    const current = await buildVaultExport(b.repository)
    const bad: VaultExport = {
      magic: 'NOTESVAULT',
      v: 2,
      meta: current.meta,
      collections: [{ name: 'Bad!', blobs: [] }],
    }
    await expect(restoreVaultExport(b.repository, bad)).rejects.toThrow()
    // данные на месте
    await b.vault.unlockWithPassphrase(PASS)
    const titles = (
      await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).listIndex()
    ).map((e) => e.title)
    expect(titles).toEqual(['Цел'])
  })

  it('сбой записи при импорте откатывается к исходному волту', async () => {
    const a = makeVault(`xfer-rb-a-${String(counter)}`)
    await a.vault.setup(PASS)
    await createNoteRepository({ repository: a.repository, crypto, vault: a.vault }).save(
      note('Из файла'),
    )
    const imported = decodeVaultExport(
      encodeVaultExport(await buildVaultExport(a.repository)),
    )

    const b = makeVault(`xfer-rb-b-${String(counter)}`)
    const bPass = 'another long passphrase here'
    await b.vault.setup(bPass)
    await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).save(
      note('Старая B'),
    )

    // репозиторий, падающий на первой записи блоба импорта
    let putCount = 0
    const failing: Repository = {
      ...b.repository,
      putBlob(collection: Collection, id: string, blob: Envelope): Promise<void> {
        putCount += 1
        if (putCount === 1) {
          return Promise.reject(new Error('IO fail'))
        }
        return b.repository.putBlob(collection, id, blob)
      },
    }

    await expect(restoreVaultExport(failing, imported)).rejects.toThrow()

    // волт B откатился к исходному состоянию
    await b.vault.initialize()
    await b.vault.unlockWithPassphrase(bPass)
    const titles = (
      await createNoteRepository({ repository: b.repository, crypto, vault: b.vault }).listIndex()
    ).map((e) => e.title)
    expect(titles).toEqual(['Старая B'])
  })
})
