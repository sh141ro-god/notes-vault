/**
 * Формат конверта (envelope) — единый контейнер для любого зашифрованного куска
 * (блоб заметки, манифест, обёртки DEK). Версионируется для будущих миграций.
 *
 * Бинарная раскладка (компактно для IndexedDB и файла экспорта):
 *   [v:u8=1][algId:u8=1][nonce:24][ct:...]
 * где ct = ciphertext + 16-байтовый тег Poly1305.
 */

export const ENVELOPE_VERSION = 1 as const

export type EnvelopeAlg = 'xchacha20poly1305'

/** Числовой код алгоритма в бинарной сериализации. */
const ALG_ID_XCHACHA20POLY1305 = 1

/** Длина nonce XChaCha20-Poly1305 (24 байта). */
export const XCHACHA20POLY1305_NONCE_BYTES = 24

export interface Envelope {
  readonly v: typeof ENVELOPE_VERSION
  readonly alg: EnvelopeAlg
  /** Случайный nonce, 24 байта; новый на каждое шифрование. */
  readonly nonce: Uint8Array
  /** Ciphertext вместе с тегом аутентификации. */
  readonly ct: Uint8Array
}

const HEADER_BYTES = 2 // v + algId
const MIN_SERIALIZED_BYTES = HEADER_BYTES + XCHACHA20POLY1305_NONCE_BYTES

/** Сериализует конверт в компактный Uint8Array. */
export function serializeEnvelope(env: Envelope): Uint8Array {
  if (env.nonce.length !== XCHACHA20POLY1305_NONCE_BYTES) {
    throw new Error(
      `Неверная длина nonce: ${String(env.nonce.length)} (ожидалось ${String(
        XCHACHA20POLY1305_NONCE_BYTES,
      )})`,
    )
  }
  const out = new Uint8Array(MIN_SERIALIZED_BYTES + env.ct.length)
  out[0] = ENVELOPE_VERSION
  out[1] = ALG_ID_XCHACHA20POLY1305
  out.set(env.nonce, HEADER_BYTES)
  out.set(env.ct, MIN_SERIALIZED_BYTES)
  return out
}

/** Разбирает Uint8Array обратно в конверт; бросает при повреждении/неизвестном формате. */
export function deserializeEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < MIN_SERIALIZED_BYTES) {
    throw new Error('Повреждённый конверт: слишком короткий')
  }
  const v = bytes[0]
  const algId = bytes[1]
  if (v !== ENVELOPE_VERSION) {
    throw new Error(`Неизвестная версия конверта: ${String(v)}`)
  }
  if (algId !== ALG_ID_XCHACHA20POLY1305) {
    throw new Error(`Неизвестный алгоритм конверта: ${String(algId)}`)
  }
  const nonce = bytes.slice(HEADER_BYTES, MIN_SERIALIZED_BYTES)
  const ct = bytes.slice(MIN_SERIALIZED_BYTES)
  return { v: ENVELOPE_VERSION, alg: 'xchacha20poly1305', nonce, ct }
}
