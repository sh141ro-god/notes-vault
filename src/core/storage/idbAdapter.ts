import {
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
  deleteDB,
  openDB,
} from 'idb'

import type { Envelope } from '@core/crypto/envelope.ts'

import {
  assertCollection,
  type Collection,
  type Repository,
  type RepositorySnapshot,
  type TombstoneRecord,
} from './repository.ts'
import {
  EnvelopeSchema,
  type TombstoneValue,
  TombstoneValueSchema,
  type VaultMeta,
  VaultMetaSchema,
} from './schemas.ts'

const DB_VERSION = 3
const DEFAULT_DB_NAME = 'notes-vault'
const SINGLETON_KEY = 'current'

interface VaultDBSchema extends DBSchema {
  blobs: { key: [string, string]; value: Envelope } // [collection, id]
  manifests: { key: string; value: Envelope } // key = collection
  vaultMeta: { key: string; value: VaultMeta }
  // v3: надгробия удалённых записей — [collection, id] → { updatedAt }.
  tombstones: { key: [string, string]; value: TombstoneValue }
}

/** Схема с легаси-сторами (v1) — нужна только для миграции в upgrade(). */
interface MigrationDBSchema extends VaultDBSchema {
  notes: { key: string; value: Envelope }
  manifest: { key: string; value: Envelope }
}

/**
 * Миграция v1 → v2: переносит блобы из `notes` в `blobs['notes', id]`, singleton
 * `manifest` в `manifests['notes']`, удаляет старые стора. Конверты переносятся
 * байт-в-байт — DEK не нужен, разблокировка не требуется. Идёт целиком внутри
 * versionchange-транзакции (атомарно).
 */
async function migrateV1ToV2(
  db: IDBPDatabase<MigrationDBSchema>,
  tx: IDBPTransaction<
    MigrationDBSchema,
    StoreNames<MigrationDBSchema>[],
    'versionchange'
  >,
): Promise<void> {
  if (db.objectStoreNames.contains('notes')) {
    const notesStore = tx.objectStore('notes')
    const keys = await notesStore.getAllKeys()
    const values = await notesStore.getAll()
    const blobs = tx.objectStore('blobs')
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      const value = values[i]
      if (key !== undefined && value !== undefined) {
        await blobs.put(value, ['notes', key])
      }
    }
    db.deleteObjectStore('notes')
  }
  if (db.objectStoreNames.contains('manifest')) {
    const manifestStore = tx.objectStore('manifest')
    const value = await manifestStore.get(SINGLETON_KEY)
    if (value !== undefined) {
      await tx.objectStore('manifests').put(value, 'notes')
    }
    db.deleteObjectStore('manifest')
  }
}

/**
 * Адаптер Repository на IndexedDB (idb). Коллекции — это префикс составного ключа
 * `[collection, id]` в одном сторе `blobs`, поэтому добавление коллекции не
 * требует менять схему БД. При чтении валидирует форму (zod): IndexedDB —
 * недоверенная граница. Крипто-логики нет.
 */
export function createIdbRepository(
  dbName: string = DEFAULT_DB_NAME,
): Repository {
  let dbPromise: Promise<IDBPDatabase<VaultDBSchema>> | undefined

  function getDb(): Promise<IDBPDatabase<VaultDBSchema>> {
    dbPromise ??= openDB<VaultDBSchema>(dbName, DB_VERSION, {
      // idb поддерживает async-upgrade, пока awaits — только idb-запросы
      // (они держат versionchange-транзакцию открытой). Тип idb объявляет
      // void-возврат, отсюда подавление правила.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async upgrade(db, _oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs')
        }
        if (!db.objectStoreNames.contains('manifests')) {
          db.createObjectStore('manifests')
        }
        if (!db.objectStoreNames.contains('vaultMeta')) {
          db.createObjectStore('vaultMeta')
        }
        // v2 → v3: новый пустой стор надгробий; данные не мигрируются.
        if (!db.objectStoreNames.contains('tombstones')) {
          db.createObjectStore('tombstones')
        }
        await migrateV1ToV2(
          db as unknown as IDBPDatabase<MigrationDBSchema>,
          tx as unknown as IDBPTransaction<
            MigrationDBSchema,
            StoreNames<MigrationDBSchema>[],
            'versionchange'
          >,
        )
      },
    })
    return dbPromise
  }

  return {
    async putBlob(collection: Collection, id: string, blob: Envelope) {
      assertCollection(collection)
      await (await getDb()).put('blobs', blob, [collection, id])
    },

    async getBlob(collection: Collection, id: string) {
      assertCollection(collection)
      const value = await (await getDb()).get('blobs', [collection, id])
      return value === undefined ? undefined : EnvelopeSchema.parse(value)
    },

    async deleteBlob(collection: Collection, id: string) {
      assertCollection(collection)
      await (await getDb()).delete('blobs', [collection, id])
    },

    async listBlobIds(collection: Collection) {
      assertCollection(collection)
      // Диапазон по первому компоненту ключа: массив [] сортируется после любой
      // строки, поэтому [collection, []] — верхняя граница всех [collection, id].
      const range = IDBKeyRange.bound([collection], [collection, []])
      const keys = await (await getDb()).getAllKeys('blobs', range)
      return keys.map((key) => key[1])
    },

    async listCollections() {
      const db = await getDb()
      const collections = new Set<string>()
      for (const key of await db.getAllKeys('blobs')) {
        collections.add(key[0])
      }
      for (const key of await db.getAllKeys('manifests')) {
        collections.add(key)
      }
      return [...collections]
    },

    async putManifest(collection: Collection, blob: Envelope) {
      assertCollection(collection)
      await (await getDb()).put('manifests', blob, collection)
    },

    async getManifest(collection: Collection) {
      assertCollection(collection)
      const value = await (await getDb()).get('manifests', collection)
      return value === undefined ? undefined : EnvelopeSchema.parse(value)
    },

    async writeBlobWithManifest(
      collection: Collection,
      id: string,
      blob: Envelope,
      manifest: Envelope,
    ) {
      assertCollection(collection)
      const tx = (await getDb()).transaction(
        ['blobs', 'manifests', 'tombstones'],
        'readwrite',
      )
      await Promise.all([
        tx.objectStore('blobs').put(blob, [collection, id]),
        tx.objectStore('manifests').put(manifest, collection),
        // Пересоздание записи отменяет её удаление — в той же транзакции.
        tx.objectStore('tombstones').delete([collection, id]),
        tx.done,
      ])
    },

    async deleteBlobWithManifest(
      collection: Collection,
      id: string,
      manifest: Envelope,
      tombstoneAt: number,
    ) {
      assertCollection(collection)
      const tx = (await getDb()).transaction(
        ['blobs', 'manifests', 'tombstones'],
        'readwrite',
      )
      await Promise.all([
        tx.objectStore('blobs').delete([collection, id]),
        tx.objectStore('manifests').put(manifest, collection),
        // Надгробие — атомарно с удалением: sync узнает об удалении даже при
        // крахе сразу после транзакции.
        tx.objectStore('tombstones').put({ updatedAt: tombstoneAt }, [collection, id]),
        tx.done,
      ])
    },

    async listTombstones() {
      const db = await getDb()
      const keys = await db.getAllKeys('tombstones')
      const values = await db.getAll('tombstones')
      const records: TombstoneRecord[] = []
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        const value = values[i]
        if (key === undefined || value === undefined) {
          continue
        }
        // IndexedDB — недоверенная граница: валидируем форму, битое пропускаем.
        const parsed = TombstoneValueSchema.safeParse(value)
        if (parsed.success) {
          records.push({
            collection: key[0],
            id: key[1],
            updatedAt: parsed.data.updatedAt,
          })
        }
      }
      return records
    },

    async putTombstone(tombstone: TombstoneRecord) {
      assertCollection(tombstone.collection)
      await (await getDb()).put(
        'tombstones',
        { updatedAt: tombstone.updatedAt },
        [tombstone.collection, tombstone.id],
      )
    },

    async deleteTombstone(collection: Collection, id: string) {
      assertCollection(collection)
      await (await getDb()).delete('tombstones', [collection, id])
    },

    async readVaultMeta() {
      const value = await (await getDb()).get('vaultMeta', SINGLETON_KEY)
      return value === undefined ? undefined : VaultMetaSchema.parse(value)
    },

    async writeVaultMeta(meta: VaultMeta) {
      await (await getDb()).put('vaultMeta', meta, SINGLETON_KEY)
    },

    async clearAll() {
      const db = await getDb()
      await db.clear('blobs')
      await db.clear('manifests')
      await db.clear('tombstones')
    },

    async replaceAll(snapshot: RepositorySnapshot) {
      for (const collection of snapshot.collections) {
        assertCollection(collection.name)
      }
      // Всё одной транзакцией по трём сторам: очистка + запись meta + раскладка
      // коллекций. Крах посреди — откат транзакции целиком (DATA-01).
      const tx = (await getDb()).transaction(
        ['blobs', 'manifests', 'vaultMeta', 'tombstones'],
        'readwrite',
      )
      const blobs = tx.objectStore('blobs')
      const manifests = tx.objectStore('manifests')
      await blobs.clear()
      await manifests.clear()
      // Импортированный снимок — авторитетное состояние: старые надгробия
      // не должны «доудалять» записи из него.
      await tx.objectStore('tombstones').clear()
      await tx.objectStore('vaultMeta').put(snapshot.meta, SINGLETON_KEY)
      for (const collection of snapshot.collections) {
        if (collection.manifest) {
          await manifests.put(collection.manifest, collection.name)
        }
        for (const entry of collection.blobs) {
          await blobs.put(entry.blob, [collection.name, entry.id])
        }
      }
      await tx.done
    },

    async close() {
      if (dbPromise) {
        const db = await dbPromise
        db.close()
        dbPromise = undefined
      }
    },
  }
}

/**
 * Удаляет базу волта целиком. Перед вызовом закройте репозиторий через `close()`.
 */
export async function deleteVaultDb(
  dbName: string = DEFAULT_DB_NAME,
): Promise<void> {
  await deleteDB(dbName, {
    blocked() {
      console.warn(
        `deleteVaultDb: база "${dbName}" заблокирована открытым соединением — вызовите close() перед удалением`,
      )
    },
  })
}
