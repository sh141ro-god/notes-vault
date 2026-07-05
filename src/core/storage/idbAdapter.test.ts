import 'fake-indexeddb/auto'

import { type DBSchema, openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Envelope } from '@core/crypto/envelope.ts'

import { createIdbRepository } from './idbAdapter.ts'
import type { Repository } from './repository.ts'
import type { VaultMeta } from './schemas.ts'

const NOTE_A = '11111111-1111-4111-8111-111111111111'
const NOTE_B = '22222222-2222-4222-8222-222222222222'

function makeEnvelope(fill = 1): Envelope {
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: new Uint8Array(24).fill(fill),
    ct: new Uint8Array([fill, fill + 1, 9, 0, 255]),
  }
}

function makeVaultMeta(): VaultMeta {
  const env = makeEnvelope(3)
  return {
    v: 1,
    kdf: { alg: 'argon2id', opslimit: 2, memlimit: 67108864 },
    salts: { pass: new Uint8Array(16).fill(1), rec: new Uint8Array(16).fill(2) },
    wrappedDek: { pass: env, rec: env },
    pinFailures: 0,
    createdAt: 1_700_000_000_000,
  }
}

let dbCounter = 0
let dbName: string
let repo: Repository

beforeEach(() => {
  dbCounter += 1
  dbName = `idb-test-${String(dbCounter)}`
  repo = createIdbRepository(dbName)
})

describe('idbAdapter — блобы по коллекциям', () => {
  it('put/get round-trip в пределах коллекции', async () => {
    const env = makeEnvelope(7)
    await repo.putBlob('notes', NOTE_A, env)
    const got = await repo.getBlob('notes', NOTE_A)
    expect([...(got?.ct ?? [])]).toEqual([...env.ct])
  })

  it('listBlobIds изолирует коллекции в одной БД', async () => {
    await repo.putBlob('notes', NOTE_A, makeEnvelope(1))
    await repo.putBlob('tasks', NOTE_B, makeEnvelope(2))
    expect(await repo.listBlobIds('notes')).toEqual([NOTE_A])
    expect(await repo.listBlobIds('tasks')).toEqual([NOTE_B])
  })

  it('listCollections возвращает коллекции с данными', async () => {
    await repo.putBlob('notes', NOTE_A, makeEnvelope())
    await repo.putManifest('tasks', makeEnvelope())
    expect((await repo.listCollections()).sort()).toEqual(['notes', 'tasks'])
  })

  it('delete и манифест на коллекцию', async () => {
    await repo.putBlob('notes', NOTE_A, makeEnvelope())
    await repo.deleteBlob('notes', NOTE_A)
    expect(await repo.getBlob('notes', NOTE_A)).toBeUndefined()
    expect(await repo.getManifest('notes')).toBeUndefined()
    await repo.putManifest('notes', makeEnvelope(5))
    expect(await repo.getManifest('notes')).toBeDefined()
  })

  it('clearAll стирает блобы/манифесты, но не VaultMeta', async () => {
    await repo.putBlob('notes', NOTE_A, makeEnvelope())
    await repo.putManifest('notes', makeEnvelope())
    await repo.writeVaultMeta(makeVaultMeta())
    await repo.clearAll()
    expect(await repo.listCollections()).toEqual([])
    expect(await repo.readVaultMeta()).toBeDefined()
  })

  it('отвергает недопустимое имя коллекции', async () => {
    await expect(repo.getBlob('NOTES!', NOTE_A)).rejects.toThrow()
  })

  it('writeBlobWithManifest пишет блоб и манифест за одну транзакцию', async () => {
    await repo.writeBlobWithManifest(
      'notes',
      NOTE_A,
      makeEnvelope(1),
      makeEnvelope(2),
    )
    expect(await repo.getBlob('notes', NOTE_A)).toBeDefined()
    expect(await repo.getManifest('notes')).toBeDefined()
  })

  it('deleteBlobWithManifest удаляет блоб и обновляет манифест атомарно', async () => {
    await repo.writeBlobWithManifest(
      'notes',
      NOTE_A,
      makeEnvelope(1),
      makeEnvelope(2),
    )
    await repo.deleteBlobWithManifest('notes', NOTE_A, makeEnvelope(3))
    expect(await repo.getBlob('notes', NOTE_A)).toBeUndefined()
    expect(await repo.getManifest('notes')).toBeDefined()
  })

  it('повреждённый VaultMeta → отказ при чтении', async () => {
    const broken: VaultMeta = { ...makeVaultMeta(), pinFailures: -1 }
    await repo.writeVaultMeta(broken)
    await expect(repo.readVaultMeta()).rejects.toThrow()
  })
})

interface V1Schema extends DBSchema {
  notes: { key: string; value: Envelope }
  manifest: { key: string; value: Envelope }
  vaultMeta: { key: string; value: VaultMeta }
}

describe('idbAdapter — миграция v1 → v2', () => {
  it('переносит заметки, манифест и VaultMeta из старой схемы', async () => {
    const name = `idb-mig-${String(dbCounter)}`
    const noteEnv = makeEnvelope(42)
    const manifestEnv = makeEnvelope(50)
    const meta = makeVaultMeta()

    // засеять БД старой схемы (DB_VERSION = 1)
    const v1 = await openDB<V1Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore('notes')
        db.createObjectStore('manifest')
        db.createObjectStore('vaultMeta')
      },
    })
    await v1.put('notes', noteEnv, NOTE_A)
    await v1.put('manifest', manifestEnv, 'current')
    await v1.put('vaultMeta', meta, 'current')
    v1.close()

    // открыть через новый адаптер → апгрейд до v2
    const migrated = createIdbRepository(name)
    expect([...(await migrated.getBlob('notes', NOTE_A))?.ct ?? []]).toEqual([
      ...noteEnv.ct,
    ])
    expect([...(await migrated.getManifest('notes'))?.ct ?? []]).toEqual([
      ...manifestEnv.ct,
    ])
    expect(await migrated.readVaultMeta()).toBeDefined()
    expect(await migrated.listBlobIds('notes')).toEqual([NOTE_A])
    await migrated.close()
  })
})
