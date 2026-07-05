import { VaultError } from './vaultError.ts'

/**
 * Минимальные требования к секретам, проверяемые в самом VaultService
 * (не только в UI). Кодовая фраза — главный секрет, поэтому планка выше; PIN —
 * компромисс удобства, но слишком короткий уязвим к офлайн-перебору обёртки DEK
 * по дампу IndexedDB, поэтому минимум вынужденно ограничивает риск.
 */
export const MIN_PASSPHRASE_LENGTH = 8
export const MIN_PIN_LENGTH = 6

export function assertPassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new VaultError(
      'WEAK_SECRET',
      `Кодовая фраза должна быть не короче ${String(MIN_PASSPHRASE_LENGTH)} символов`,
    )
  }
}

export function assertPin(pin: string): void {
  if (pin.length < MIN_PIN_LENGTH) {
    throw new VaultError(
      'WEAK_SECRET',
      `PIN должен быть не короче ${String(MIN_PIN_LENGTH)} символов`,
    )
  }
}
