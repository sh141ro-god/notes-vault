import type { Envelope } from './envelope.ts'

/** Длина симметричного ключа (DEK / wrap-ключ), байт. */
export const KEY_BYTES = 32

/**
 * Порт симметричной крипты. Реализуется адаптером на libsodium
 * (XChaCha20-Poly1305). Ядро и use-cases зависят от этого интерфейса, не от
 * libsodium напрямую.
 */
export interface CryptoService {
  /** Случайный 32-байтовый ключ (например, DEK). */
  randomKey(): Uint8Array
  /** n криптографически стойких случайных байт (например, соль). */
  randomBytes(n: number): Uint8Array
  /** Шифрует plaintext под key, возвращает конверт со свежим nonce. */
  encrypt(key: Uint8Array, plaintext: Uint8Array): Envelope
  /** Расшифровывает конверт; бросает при неверном ключе или подделке (Poly1305). */
  decrypt(key: Uint8Array, env: Envelope): Uint8Array
  /**
   * Затирает чувствительные байты на месте (ключи, расшифрованный текст) сразу
   * после использования — сужает окно экспозиции в памяти (дамп/своп). В JS
   * гарантии слабее нативных, но это штатная мера (libsodium memzero).
   */
  wipe(bytes: Uint8Array): void
}
