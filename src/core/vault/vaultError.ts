/** Коды ошибок волта — для дружелюбных сообщений в UI (M5). */
export type VaultErrorCode =
  | 'ALREADY_INITIALIZED'
  | 'NO_VAULT'
  | 'LOCKED'
  | 'WRONG_SECRET'
  | 'WEAK_SECRET'
  | 'PIN_NOT_SET'
  | 'PIN_LOCKED_OUT'

export class VaultError extends Error {
  readonly code: VaultErrorCode

  constructor(code: VaultErrorCode, message: string) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}
