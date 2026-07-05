import { VaultError } from '@core/vault/vaultError.ts'

/** Дружелюбное сообщение об ошибке волта (без утечки технических деталей). */
export function vaultErrorMessage(error: unknown): string {
  if (error instanceof VaultError) {
    return error.message
  }
  return 'Произошла ошибка. Попробуйте ещё раз.'
}
