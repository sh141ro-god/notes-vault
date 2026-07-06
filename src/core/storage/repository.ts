import type { Envelope } from '@core/crypto/envelope.ts'

import type { VaultMeta } from './schemas.ts'

/**
 * Неймспейс коллекции ('notes', 'tasks', 'diary').
 *
 * ВНИМАНИЕ по безопасности: имя коллекции хранится в ключе IndexedDB ОТКРЫТО
 * (как прежде хранились имена object store). Это часть принятой моделью угроз
 * утечки метаданных. Для доменов, само наличие которых чувствительно, используйте
 * непрозрачный (хэшированный) идентификатор коллекции вместо говорящего имени.
 */
export type Collection = string

const COLLECTION_RE = /^[a-z][a-z0-9-]{0,63}$/

/** Допустимо ли имя коллекции (строчная буква + [a-z0-9-], до 64 символов). */
export function isValidCollection(collection: string): boolean {
  return COLLECTION_RE.test(collection)
}

/** Валидация имени коллекции на границе хранилища. */
export function assertCollection(collection: string): void {
  if (!isValidCollection(collection)) {
    throw new Error(`Недопустимое имя коллекции: ${collection}`)
  }
}

/**
 * Надгробие: след удалённой записи. Нужен, чтобы синхронизация РАСПРОСТРАНЯЛА
 * удаления (иначе сервер «воскрешает» запись при следующем pull). Хранится
 * локально бессрочно: дёшево и защищает от воскрешения устройствами, долго
 * бывшими офлайн (на сервере — TTL, см. syncStore).
 */
export interface TombstoneRecord {
  collection: Collection
  id: string
  /** Момент удаления (мс) — участвует в LWW наравне с updatedAt записей. */
  updatedAt: number
}

/** Снимок одной коллекции (зашифрованный манифест + блобы) для replaceAll. */
export interface RepositoryCollectionSnapshot {
  name: Collection
  manifest?: Envelope
  blobs: { id: string; blob: Envelope }[]
}

/** Полный слепок волта для атомарной замены (DATA-01). */
export interface RepositorySnapshot {
  meta: VaultMeta
  collections: RepositoryCollectionSnapshot[]
}

/**
 * Порт персистентности. Хранит ТОЛЬКО байты (Envelope) и открытую VaultMeta,
 * разложенные по коллекциям. Доменно-нейтрален: ничего не знает о заметках/задачах.
 * Никакой крипто-логики внутри.
 */
export interface Repository {
  putBlob(collection: Collection, id: string, blob: Envelope): Promise<void>
  getBlob(collection: Collection, id: string): Promise<Envelope | undefined>
  deleteBlob(collection: Collection, id: string): Promise<void>
  listBlobIds(collection: Collection): Promise<string[]>
  /** Коллекции, в которых есть данные (для экспорта/полного обхода). */
  listCollections(): Promise<Collection[]>

  putManifest(collection: Collection, blob: Envelope): Promise<void>
  getManifest(collection: Collection): Promise<Envelope | undefined>

  /**
   * Атомарно (одна транзакция) записывает блоб и манифест коллекции; попутно
   * убирает надгробие записи (пересоздание отменяет удаление).
   */
  writeBlobWithManifest(
    collection: Collection,
    id: string,
    blob: Envelope,
    manifest: Envelope,
  ): Promise<void>
  /**
   * Атомарно (одна транзакция) удаляет блоб, записывает манифест коллекции и
   * ставит надгробие с моментом удаления `tombstoneAt` (для распространения
   * удаления через sync).
   */
  deleteBlobWithManifest(
    collection: Collection,
    id: string,
    manifest: Envelope,
    tombstoneAt: number,
  ): Promise<void>

  /** Все надгробия волта (для gather в синхронизации). */
  listTombstones(): Promise<TombstoneRecord[]>
  /** Пишет/обновляет надгробие (применение удаления, пришедшего по sync). */
  putTombstone(tombstone: TombstoneRecord): Promise<void>
  /** Убирает надгробие (запись воскрешена более новой правкой с другого устройства). */
  deleteTombstone(collection: Collection, id: string): Promise<void>

  readVaultMeta(): Promise<VaultMeta | undefined>
  writeVaultMeta(meta: VaultMeta): Promise<void>

  /** Стирает все блобы, манифесты и надгробия (VaultMeta не трогает) — для импорта/сброса. */
  clearAll(): Promise<void>

  /**
   * Атомарно (одна транзакция по всем сторам) заменяет ВЕСЬ волт снимком: очищает
   * blobs/manifests/tombstones, перезаписывает vaultMeta и раскладывает коллекции.
   * Надгробия сбрасываются: импортированный снимок — авторитетное состояние. Либо
   * применяется целиком, либо не применяется ничего — крах посреди импорта не
   * оставляет волт в полустёртом состоянии (DATA-01).
   */
  replaceAll(snapshot: RepositorySnapshot): Promise<void>

  /** Закрывает соединение (обязательно перед удалением БД). */
  close(): Promise<void>
}
