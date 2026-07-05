/**
 * Параметры KDF (Argon2id). Хранятся открыто в VaultMeta (это не секрет, а
 * настройки вывода ключа). Тип объявлен здесь, в самом внутреннем слое, и
 * переиспользуется VaultMeta в M2/M3 — зависимость направлена внутрь.
 */
export interface KdfParams {
  readonly alg: 'argon2id'
  /** opslimit Argon2id (число итераций). */
  readonly opslimit: number
  /** memlimit Argon2id (байт памяти). */
  readonly memlimit: number
}

/** Длина соли Argon2id, байт. */
export const ARGON2ID_SALT_BYTES = 16

/** Энтропия ключа восстановления: 20 байт = 160 бит. */
export const RECOVERY_CODE_BYTES = 20

/**
 * Порт вывода ключей и генерации ключа восстановления. `deriveWrapKey`
 * асинхронный: тяжёлый Argon2id в браузере выполняется в Web Worker, чтобы не
 * замораживать UI (см. workerKeyDerivation.ts); прямой адаптер вычисляет
 * синхронно и оборачивает в Promise.
 */
export interface KeyDerivation {
  /** Выводит 32-байтовый wrap-ключ из секрета и соли (детерминированно). */
  deriveWrapKey(
    secret: string,
    salt: Uint8Array,
    kdf: KdfParams,
  ): Promise<Uint8Array>
  /** Генерирует высокоэнтропийный ключ восстановления (160 бит, Crockford base32). */
  generateRecoveryCode(): string
}
