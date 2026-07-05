import type { Sodium } from '@core/crypto/sodium.ts'

/**
 * Идентичность синхронизации из «кода синхронизации» (без почты/аккаунта).
 *
 * Код — 160-битный случайный секрет (как ключ восстановления), Crockford base32.
 * Из него ДЕТЕРМИНИРОВАННО выводятся:
 *   - syncId    — адрес «корзины» на сервере (куда класть/откуда брать блобы);
 *   - authToken — доказательство владения корзиной.
 * Оба — BLAKE2b(код) с разными доменными ключами. Код высокоэнтропийный, поэтому
 * KDF-растяжка не нужна. Секрет один — сам код; кто его знает, тот синхронизирует.
 * Данные при этом остаются зашифрованы ключом волта (DEK) — сервер видит только
 * шифртекст.
 */

const CODE_BYTES = 20 // 160 бит
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
// Доменные ключи BLAKE2b (>=16 байт — требование crypto_generichash).
const ID_CONTEXT = 'notesvault-syncid1'
const AUTH_CONTEXT = 'notesvault-synauth'
const HASH_BYTES = 32
/** Минимум значимых символов в нормализованном коде (160 бит ≈ 32 симв.). */
const MIN_CODE_CHARS = 24

export interface SyncIdentity {
  /** Публичный идентификатор корзины на сервере. */
  syncId: string
  /** Секрет доступа к корзине (bearer). */
  authToken: string
}

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

/** Новый случайный код синхронизации (Crockford base32, группами по 4). */
export function generateSyncCode(sodium: Sodium): string {
  return groupByFour(encodeCrockfordBase32(sodium.randombytes_buf(CODE_BYTES)))
}

/** Нормализует ввод кода: верхний регистр, только [0-9A-Z] (дефисы/пробелы прочь). */
export function normalizeSyncCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

function hashToB64(sodium: Sodium, message: Uint8Array, context: string): string {
  const key = sodium.from_string(context)
  const digest = sodium.crypto_generichash(HASH_BYTES, message, key)
  return sodium.to_base64(digest, sodium.base64_variants.URLSAFE_NO_PADDING)
}

/**
 * Выводит syncId и authToken из кода (после нормализации). Одинаковый код на
 * любом устройстве даёт одинаковую идентичность. Слишком короткий код отвергается.
 */
export function deriveSyncIdentity(sodium: Sodium, code: string): SyncIdentity {
  const normalized = normalizeSyncCode(code)
  if (normalized.length < MIN_CODE_CHARS) {
    throw new Error('Слишком короткий код синхронизации')
  }
  const message = sodium.from_string(normalized)
  return {
    syncId: hashToB64(sodium, message, ID_CONTEXT),
    authToken: hashToB64(sodium, message, AUTH_CONTEXT),
  }
}
