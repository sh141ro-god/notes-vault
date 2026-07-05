/**
 * Статус волта (машина состояний). `recoveryOnly` — быстрый PIN-вход отключён
 * (стёрт после серии неудач); фраза и ключ восстановления продолжают работать.
 */
export type VaultStatus =
  | 'uninitialized'
  | 'setup'
  | 'locked'
  | 'unlocked'
  | 'recoveryOnly'

export interface VaultService {
  /** Текущий статус (синхронно). */
  status(): VaultStatus
  /** Определяет начальный статус по наличию волта на диске (вызвать на старте). */
  initialize(): Promise<VaultStatus>
  /** Первичная настройка: создаёт DEK и обёртки, возвращает ОДНОКРАТНО recovery-код. */
  setup(passphrase: string): Promise<{ recoveryCode: string }>
  unlockWithPassphrase(passphrase: string): Promise<void>
  unlockWithPin(pin: string): Promise<void>
  unlockWithRecovery(code: string): Promise<void>
  /** Заворачивает DEK под PIN (требует разблокированного волта). */
  enablePin(pin: string): Promise<void>
  /** Перешифровывает ТОЛЬКО обёртку DEK под фразой; данные не трогает. */
  changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void>
  /** Генерирует НОВЫЙ ключ восстановления; перешифровывает только rec-обёртку DEK. */
  changeRecoveryCode(): Promise<{ recoveryCode: string }>
  /** Обнуляет DEK в памяти и переводит в locked. */
  lock(): void
  /** Возвращает DEK или бросает, если волт не разблокирован. */
  requireKey(): Uint8Array
}
