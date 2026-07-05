import type { KdfParams } from './keyDerivation.ts'
import { RECOVERY_CODE_BYTES } from './keyDerivation.ts'
import type { Sodium } from './sodium.ts'

/** Длина выводимого wrap-ключа, байт. */
const WRAP_KEY_BYTES = 32

/** Crockford base32 — без I, L, O, U (снижает ошибки при ручном переписывании). */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeCrockfordBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD_ALPHABET.charAt((value >>> bits) & 31)
    }
  }
  if (bits > 0) {
    out += CROCKFORD_ALPHABET.charAt((value << (5 - bits)) & 31)
  }
  return out
}

function groupByFour(code: string): string {
  const groups: string[] = []
  for (let i = 0; i < code.length; i += 4) {
    groups.push(code.slice(i, i + 4))
  }
  return groups.join('-')
}

/**
 * Синхронный вывод wrap-ключа Argon2id. Тяжёлая операция (десятки—сотни мс):
 * на главном потоке вызывать только в тестах/Node; в браузере — через Web Worker
 * (см. workerKeyDerivation.ts), чтобы не блокировать UI.
 */
export function deriveWrapKeyWith(
  sodium: Sodium,
  secret: string,
  salt: Uint8Array,
  kdf: KdfParams,
): Uint8Array {
  if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(
      `Неверная длина соли: ${String(salt.length)} (ожидалось ${String(
        sodium.crypto_pwhash_SALTBYTES,
      )})`,
    )
  }
  return sodium.crypto_pwhash(
    WRAP_KEY_BYTES,
    secret,
    salt,
    kdf.opslimit,
    kdf.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

/** Высокоэнтропийный ключ восстановления (160 бит, Crockford base32). */
export function generateRecoveryCodeWith(sodium: Sodium): string {
  return groupByFour(encodeCrockfordBase32(sodium.randombytes_buf(RECOVERY_CODE_BYTES)))
}
