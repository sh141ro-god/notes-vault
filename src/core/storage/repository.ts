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

  /** Атомарно (одна транзакция) записывает блоб и манифест коллекции. */
  writeBlobWithManifest(
    collection: Collection,
    id: string,
    blob: Envelope,
    manifest: Envelope,
  ): Promise<void>
  /** Атомарно (одна транзакция) удаляет блоб и записывает манифест коллекции. */
  deleteBlobWithManifest(
    collection: Collection,
    id: string,
    manifest: Envelope,
  ): Promise<void>

  readVaultMeta(): Promise<VaultMeta | undefined>
  writeVaultMeta(meta: VaultMeta): Promise<void>

  /** Стирает все блобы и манифесты (VaultMeta не трогает) — для импорта/сброса. */
  clearAll(): Promise<void>

  /**
   * Атомарно (одна транзакция по всем сторам) заменяет ВЕСЬ волт снимком: очищает
   * blobs/manifests, перезаписывает vaultMeta и раскладывает коллекции. Либо
   * применяется целиком, либо не применяется ничего — крах посреди импорта не
   * оставляет волт в полустёртом состоянии (DATA-01).
   */
  replaceAll(snapshot: RepositorySnapshot): Promise<void>

  /** Закрывает соединение (обязательно перед удалением БД). */
  close(): Promise<void>
}
