import type { SyncItem } from './syncEngine.ts'

/** Результат выгрузки корзины с сервера. */
export interface SyncPullResult {
  /** Сериализованная открытая VaultMeta (или null, если корзина пуста). */
  meta: string | null
  items: SyncItem[]
}

/**
 * Порт удалённого хранилища синхронизации. Конкретный адрес корзины (syncId) и
 * токен доступа зашиты в адаптер при создании — сервис их не знает.
 */
export interface SyncTarget {
  pull(): Promise<SyncPullResult>
  push(meta: string | null, items: SyncItem[]): Promise<{ applied: number }>
}
