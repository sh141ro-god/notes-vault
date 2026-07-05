import type { Envelope } from '@core/crypto/envelope.ts'
import { isValidCollection } from '@core/storage/repository.ts'
import type { VaultMeta } from '@core/storage/schemas.ts'
import { z } from 'zod'

import {
  VAULT_EXPORT_MAGIC,
  VAULT_EXPORT_VERSION,
  type VaultExport,
} from './transportTarget.ts'

/** Понятная ошибка переноса (показывается пользователю). */
export class TransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransportError'
  }
}

// --- base64 (btoa/atob есть и в браузере, и в Node) ---
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

const EnvelopeFileSchema = z.object({
  v: z.literal(1),
  alg: z.literal('xchacha20poly1305'),
  nonce: z.string(),
  ct: z.string(),
})
type EnvelopeFile = z.infer<typeof EnvelopeFileSchema>

const MetaFileSchema = z.object({
  v: z.literal(1),
  kdf: z.object({
    alg: z.literal('argon2id'),
    opslimit: z.number().int().positive(),
    memlimit: z.number().int().positive(),
  }),
  salts: z.object({
    pass: z.string(),
    rec: z.string(),
    pin: z.string().optional(),
  }),
  wrappedDek: z.object({
    pass: EnvelopeFileSchema,
    rec: EnvelopeFileSchema,
    pin: EnvelopeFileSchema.optional(),
  }),
  pinFailures: z.number().int().nonnegative(),
  createdAt: z.number().int(),
})
type MetaFile = z.infer<typeof MetaFileSchema>

const BlobFileSchema = z.object({
  id: z.string().uuid(),
  blob: EnvelopeFileSchema,
})

const V2FileSchema = z.object({
  magic: z.literal(VAULT_EXPORT_MAGIC),
  v: z.literal(2),
  meta: MetaFileSchema,
  collections: z.array(
    z.object({
      // Имя коллекции валидируется ДО любых операций с хранилищем (см. RESTORE-01):
      // битый/враждебный файл отвергается на декодировании, не стирая текущий волт.
      name: z.string().refine(isValidCollection, {
        message: 'Недопустимое имя коллекции',
      }),
      manifest: EnvelopeFileSchema.optional(),
      blobs: z.array(BlobFileSchema),
    }),
  ),
})

/** Старый формат файла (v1, note-центричный) — для обратной совместимости импорта. */
const V1FileSchema = z.object({
  magic: z.literal(VAULT_EXPORT_MAGIC),
  v: z.literal(1),
  meta: MetaFileSchema,
  manifest: EnvelopeFileSchema.optional(),
  notes: z.array(BlobFileSchema),
})

const VaultExportFileSchema = z.discriminatedUnion('v', [
  V1FileSchema,
  V2FileSchema,
])

function envToFile(env: Envelope): EnvelopeFile {
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: bytesToB64(env.nonce),
    ct: bytesToB64(env.ct),
  }
}

function fileToEnv(file: EnvelopeFile): Envelope {
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: b64ToBytes(file.nonce),
    ct: b64ToBytes(file.ct),
  }
}

function metaToFile(meta: VaultMeta): MetaFile {
  return {
    v: 1,
    kdf: meta.kdf,
    salts: {
      pass: bytesToB64(meta.salts.pass),
      rec: bytesToB64(meta.salts.rec),
      ...(meta.salts.pin ? { pin: bytesToB64(meta.salts.pin) } : {}),
    },
    wrappedDek: {
      pass: envToFile(meta.wrappedDek.pass),
      rec: envToFile(meta.wrappedDek.rec),
      ...(meta.wrappedDek.pin ? { pin: envToFile(meta.wrappedDek.pin) } : {}),
    },
    pinFailures: meta.pinFailures,
    createdAt: meta.createdAt,
  }
}

function fileToMeta(file: MetaFile): VaultMeta {
  return {
    v: 1,
    kdf: file.kdf,
    salts: {
      pass: b64ToBytes(file.salts.pass),
      rec: b64ToBytes(file.salts.rec),
      ...(file.salts.pin ? { pin: b64ToBytes(file.salts.pin) } : {}),
    },
    wrappedDek: {
      pass: fileToEnv(file.wrappedDek.pass),
      rec: fileToEnv(file.wrappedDek.rec),
      ...(file.wrappedDek.pin ? { pin: fileToEnv(file.wrappedDek.pin) } : {}),
    },
    pinFailures: file.pinFailures,
    createdAt: file.createdAt,
  }
}

/** Сериализует снимок волта (v2) в текст файла. */
export function encodeVaultExport(data: VaultExport): string {
  return JSON.stringify({
    magic: VAULT_EXPORT_MAGIC,
    v: VAULT_EXPORT_VERSION,
    meta: metaToFile(data.meta),
    collections: data.collections.map((collection) => ({
      name: collection.name,
      ...(collection.manifest
        ? { manifest: envToFile(collection.manifest) }
        : {}),
      blobs: collection.blobs.map((entry) => ({
        id: entry.id,
        blob: envToFile(entry.blob),
      })),
    })),
  })
}

/** Разбирает файл (v1 или v2) в снимок v2; бросает TransportError на чужой/битый. */
export function decodeVaultExport(text: string): VaultExport {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new TransportError('Файл повреждён: это не корректный JSON')
  }

  const parsed = VaultExportFileSchema.safeParse(json)
  if (!parsed.success) {
    throw new TransportError(
      'Это не файл волта Notes Vault (или он повреждён/несовместимой версии)',
    )
  }
  const file = parsed.data

  try {
    const meta = fileToMeta(file.meta)
    const collections =
      file.v === 2
        ? file.collections.map((collection) => ({
            name: collection.name,
            ...(collection.manifest
              ? { manifest: fileToEnv(collection.manifest) }
              : {}),
            blobs: collection.blobs.map((entry) => ({
              id: entry.id,
              blob: fileToEnv(entry.blob),
            })),
          }))
        : [
            {
              name: 'notes',
              ...(file.manifest ? { manifest: fileToEnv(file.manifest) } : {}),
              blobs: file.notes.map((entry) => ({
                id: entry.id,
                blob: fileToEnv(entry.blob),
              })),
            },
          ]
    return { magic: VAULT_EXPORT_MAGIC, v: VAULT_EXPORT_VERSION, meta, collections }
  } catch {
    throw new TransportError('Файл волта повреждён (ошибка декодирования base64)')
  }
}
