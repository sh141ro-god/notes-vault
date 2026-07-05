import type { Envelope } from '@core/crypto/envelope.ts'
import type { VaultMeta } from '@core/storage/schemas.ts'

export const VAULT_EXPORT_MAGIC = 'NOTESVAULT'
export const VAULT_EXPORT_VERSION = 2

/** Снимок одной коллекции (зашифрованный манифест + блобы). */
export interface CollectionSnapshot {
  name: string
  manifest?: Envelope
  blobs: { id: string; blob: Envelope }[]
}

/**
 * Самодостаточный снимок волта для переноса между устройствами (v2 —
 * коллекционный). Содержит открытую VaultMeta + зашифрованные коллекции. Защищён
 * так же, как данные на диске: без кодовой фразы/ключа восстановления бесполезен.
 * Утечка метаданных (имена коллекций, число/размер записей) — принятый компромисс.
 */
export interface VaultExport {
  magic: typeof VAULT_EXPORT_MAGIC
  v: typeof VAULT_EXPORT_VERSION
  meta: VaultMeta
  collections: CollectionSnapshot[]
}

export interface TransportTarget {
  readonly id: string
  export(data: VaultExport): Promise<void>
  import(): Promise<VaultExport>
}
