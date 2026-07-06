import type { SyncItem } from './syncEngine.ts'

/** Результат выгрузки корзины с сервера. */
export interface SyncPullResult {
  /** Сериализованная открытая VaultMeta (или null, если корзина пуста). */
  meta: string | null
  items: SyncItem[]
  /** Непрозрачная версия корзины на момент pull (null — корзина не менялась/пуста). */
  ver: string | null
}

/** Результат приёма изменений сервером. */
export interface SyncPushResult {
  applied: number
  /** Версия корзины после push (меняется только при реальных изменениях). */
  ver: string | null
}

/**
 * Порт удалённого хранилища синхронизации. Конкретный адрес корзины (syncId) и
 * токен доступа зашиты в адаптер при создании — сервис их не знает.
 */
export interface SyncTarget {
  pull(): Promise<SyncPullResult>
  push(meta: string | null, items: SyncItem[]): Promise<SyncPushResult>
  /** Дешёвая проверка версии корзины (без выгрузки содержимого). */
  version(): Promise<string | null>
}
