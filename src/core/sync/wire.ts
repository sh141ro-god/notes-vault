import {
  deserializeEnvelope,
  serializeEnvelope,
  type Envelope,
} from '@core/crypto/envelope.ts'
import type { VaultMeta } from '@core/storage/schemas.ts'
import {
  VAULT_EXPORT_MAGIC,
  VAULT_EXPORT_VERSION,
} from '@core/transport/transportTarget.ts'
import {
  decodeVaultExport,
  encodeVaultExport,
} from '@core/transport/vaultExportCodec.ts'

/**
 * Сериализация «по проводу» для синхронизации. Конверт записи → компактная base64
 * (бинарная раскладка конверта уже есть в crypto). Открытая VaultMeta переносится
 * через УЖЕ протестированный кодек экспорта (обёртываем в пустой VaultExport),
 * чтобы не дублировать base64-логику метаданных.
 */

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function b64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export function envelopeToWire(env: Envelope): string {
  return bytesToB64(serializeEnvelope(env))
}

export function wireToEnvelope(text: string): Envelope {
  return deserializeEnvelope(b64ToBytes(text))
}

export function metaToWire(meta: VaultMeta): string {
  return encodeVaultExport({
    magic: VAULT_EXPORT_MAGIC,
    v: VAULT_EXPORT_VERSION,
    meta,
    collections: [],
  })
}

export function wireToMeta(text: string): VaultMeta {
  return decodeVaultExport(text).meta
}
