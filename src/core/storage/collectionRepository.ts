import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { VaultService } from '@core/vault/vaultState.ts'
import type { ZodType, ZodTypeDef } from 'zod'

import {
  emptyManifest,
  type Manifest,
  MANIFEST_SCHEMA_VERSION,
  type ManifestEntry,
  type ManifestIndexFields,
  parseManifest,
} from './manifest.ts'
import { assertCollection, type Collection, type Repository } from './repository.ts'

export interface CollectionEntity {
  id: string
  updatedAt: number
}

export interface CollectionRepository<T extends CollectionEntity> {
  /** Лёгкий список из манифеста (id/title/updatedAt/…) — БЕЗ расшифровки тел. */
  listIndex(): Promise<ManifestEntry[]>
  /** Полные сущности: полный обход блобов с расшифровкой (для миграции/реиндексации). */
  listAll(): Promise<T[]>
  /** Перестраивает манифест из блобов (самолечение + backfill индекса). */
  reindex(): Promise<ManifestEntry[]>
  get(id: string): Promise<T | undefined>
  save(entity: T): Promise<void>
  remove(id: string): Promise<void>
}

export interface CollectionRepoDeps<T extends CollectionEntity> {
  collection: Collection
  schema: ZodType<T, ZodTypeDef, unknown>
  /**
   * Проекция сущности в денормализованные поля индекса манифеста (title, tagIds,
   * day, lastOpenedAt, progress). Возвращай только реально нужные поля — остальные
   * опускай. Источник истины всегда блоб; индекс — лишь дешёвая копия.
   */
  toIndex: (entity: T) => ManifestIndexFields
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

/**
 * Предел длины денормализованного title в индексе (PERF-01). Манифест
 * переписывается целиком на каждый save; неограниченный title (источник —
 * пользовательский ввод) раздувал бы каждую последующую запись всей коллекции.
 * Источник истины — блоб, поэтому обрезка индекса безопасна для списков.
 */
const MAX_INDEX_TITLE_LENGTH = 200

/**
 * Мьютексы записи по имени коллекции — МОДУЛЬНЫЕ (общие для всех экземпляров
 * репозитория): UI создаёт createCollectionRepository на каждый компонент, а
 * манифест — единый ресурс на коллекцию. Сериализация read-modify-write манифеста
 * (save/remove/reindex) внутри вкладки закрывает гонку lost-update (DATA-02).
 * Между вкладками нужен Web Locks API — вне объёма этой правки.
 */
const collectionWriteLocks = new Map<Collection, Promise<unknown>>()

function runExclusiveOn<R>(
  collection: Collection,
  operation: () => Promise<R>,
): Promise<R> {
  const prev = collectionWriteLocks.get(collection) ?? Promise.resolve()
  const run = prev.then(operation, operation)
  collectionWriteLocks.set(
    collection,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

/**
 * Переиспользуемый репозиторий доменной коллекции поверх зашифрованного
 * Repository. Шифрует/расшифровывает сущности и манифест ключом волта (DEK);
 * ключ берётся на каждую операцию через vault.requireKey() (при locked —
 * бросает). Любой модуль приносит имя коллекции, zod-схему и проектор индекса —
 * и получает CRUD без копирования логики и без правок ядра.
 *
 * Устойчивость: listAll/reindex пропускают непарсящиеся записи (одна битая
 * запись не роняет остальные). Самолечение: reindex перестраивает манифест из
 * фактических блобов. Запись save/remove атомарна (одна транзакция blob+manifest);
 * шифрование выполняется до фазы записи. Манифест — единый конверт на коллекцию,
 * переписывается целиком на каждый save (write-amplification растёт с числом
 * записей — приемлемо для личных объёмов, предел осознанный).
 */
export function createCollectionRepository<T extends CollectionEntity>(
  deps: CollectionRepoDeps<T>,
): CollectionRepository<T> {
  const { collection, schema, toIndex, repository, crypto, vault } = deps
  assertCollection(collection)

  function dek(): Uint8Array {
    return vault.requireKey()
  }

  function encode(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value))
  }

  function decodeEntity(bytes: Uint8Array): T {
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  }

  function toEntry(entity: T): ManifestEntry {
    const fields = toIndex(entity)
    // Копируем только определённые поля (exactOptionalPropertyTypes: нельзя
    // присваивать undefined опциональным ключам).
    const entry: ManifestEntry = { id: entity.id, updatedAt: entity.updatedAt }
    if (fields.title !== undefined)
      entry.title = fields.title.slice(0, MAX_INDEX_TITLE_LENGTH)
    if (fields.tagIds !== undefined) entry.tagIds = fields.tagIds
    if (fields.day !== undefined) entry.day = fields.day
    if (fields.lastOpenedAt !== undefined) entry.lastOpenedAt = fields.lastOpenedAt
    if (fields.openCount !== undefined) entry.openCount = fields.openCount
    if (fields.progress !== undefined) entry.progress = fields.progress
    return entry
  }

  async function readManifest(): Promise<Manifest> {
    const env = await repository.getManifest(collection)
    if (!env) {
      return emptyManifest()
    }
    return parseManifest(
      JSON.parse(new TextDecoder().decode(crypto.decrypt(dek(), env))),
    )
  }

  async function writeManifest(manifest: Manifest): Promise<void> {
    await repository.putManifest(collection, crypto.encrypt(dek(), encode(manifest)))
  }

  async function fullScan(): Promise<{ entities: T[]; entries: ManifestEntry[] }> {
    // Ключ берём ДО цикла: ошибка LOCKED должна пробрасываться, а не глотаться
    // per-entry catch'ем (он только для непарсящихся/битых записей).
    const key = dek()
    const ids = await repository.listBlobIds(collection)
    const entities: T[] = []
    for (const id of ids) {
      try {
        const env = await repository.getBlob(collection, id)
        if (!env) {
          continue
        }
        entities.push(decodeEntity(crypto.decrypt(key, env)))
      } catch {
        // Непарсящаяся/несовместимая запись — пропускаем, не роняя список.
        continue
      }
    }
    entities.sort((a, b) => b.updatedAt - a.updatedAt)
    return { entities, entries: entities.map((entity) => toEntry(entity)) }
  }

  return {
    async listIndex(): Promise<ManifestEntry[]> {
      const manifest = await readManifest()
      return [...manifest.entries].sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async listAll(): Promise<T[]> {
      return (await fullScan()).entities
    },

    reindex(): Promise<ManifestEntry[]> {
      return runExclusiveOn(collection, async () => {
        const { entries } = await fullScan()
        await writeManifest({ schemaVersion: MANIFEST_SCHEMA_VERSION, entries })
        return entries
      })
    },

    async get(id: string): Promise<T | undefined> {
      const env = await repository.getBlob(collection, id)
      return env ? decodeEntity(crypto.decrypt(dek(), env)) : undefined
    },

    save(entity: T): Promise<void> {
      // Сериализовано мьютексом коллекции (DATA-02): read-modify-write манифеста
      // двух параллельных save больше не теряет запись.
      return runExclusiveOn(collection, async () => {
        // Читаем манифест (нужен DEK; чисто упадёт, если волт заблокирован), затем
        // захватываем ключ и шифруем ВСЁ синхронно — фаза записи к ключу уже не
        // обращается. Поэтому авто-лок посреди операции либо отменяет её до записи,
        // либо не вредит атомарной записи (LOCK-01).
        const manifest = await readManifest()
        const key = dek()
        const others = manifest.entries.filter((entry) => entry.id !== entity.id)
        const blobEnv = crypto.encrypt(key, encode(entity))
        const manifestEnv = crypto.encrypt(
          key,
          encode({
            schemaVersion: MANIFEST_SCHEMA_VERSION,
            entries: [...others, toEntry(entity)],
          }),
        )
        // Блоб и манифест пишутся атомарно (NOTES-02): либо оба, либо ни одного.
        await repository.writeBlobWithManifest(
          collection,
          entity.id,
          blobEnv,
          manifestEnv,
        )
      })
    },

    remove(id: string): Promise<void> {
      return runExclusiveOn(collection, async () => {
        const manifest = await readManifest()
        const key = dek()
        const manifestEnv = crypto.encrypt(
          key,
          encode({
            schemaVersion: MANIFEST_SCHEMA_VERSION,
            entries: manifest.entries.filter((entry) => entry.id !== id),
          }),
        )
        // Момент удаления — сейчас: в LWW-слиянии надгробие должно побеждать
        // все более ранние правки записи на других устройствах.
        await repository.deleteBlobWithManifest(collection, id, manifestEnv, Date.now())
      })
    },
  }
}
