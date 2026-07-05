import type { CryptoService } from './cryptoService.ts'
import { KEY_BYTES } from './cryptoService.ts'
import type { Envelope } from './envelope.ts'
import { ENVELOPE_VERSION } from './envelope.ts'
import type { Sodium } from './sodium.ts'

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `Неверная длина ключа: ${String(key.length)} (ожидалось ${String(KEY_BYTES)})`,
    )
  }
}

/**
 * Приводит вход к Uint8Array «родного» realm. libsodium отвергает типизированные
 * массивы из другого realm («unsupported input type») — такое возможно, когда
 * байты пришли из иного контекста (Web Worker, тестовый jsdom). В одном realm это
 * no-op без копирования данных.
 */
function sameRealm(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(
        (bytes as Uint8Array).buffer,
        (bytes as Uint8Array).byteOffset,
        (bytes as Uint8Array).byteLength,
      )
}

/**
 * Адаптер CryptoService на libsodium: XChaCha20-Poly1305 (AEAD).
 * Своё не изобретаем — только тонкая обёртка над примитивами.
 */
export function createSodiumCryptoService(sodium: Sodium): CryptoService {
  return {
    randomKey(): Uint8Array {
      return sodium.crypto_aead_xchacha20poly1305_ietf_keygen()
    },

    randomBytes(n: number): Uint8Array {
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`Неверное число байт: ${String(n)}`)
      }
      return sodium.randombytes_buf(n)
    },

    encrypt(key: Uint8Array, plaintext: Uint8Array): Envelope {
      assertKey(key)
      const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
      )
      const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        sameRealm(plaintext),
        null,
        null,
        nonce,
        key,
      )
      return { v: ENVELOPE_VERSION, alg: 'xchacha20poly1305', nonce, ct }
    },

    decrypt(key: Uint8Array, env: Envelope): Uint8Array {
      assertKey(key)
      // Бросает, если тег не сошёлся (подделка) или ключ неверный.
      return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        sameRealm(env.ct),
        null,
        sameRealm(env.nonce),
        key,
      )
    },

    wipe(bytes: Uint8Array): void {
      sodium.memzero(bytes)
    },
  }
}
