import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

/**
 * Хранит код синхронизации ЗАШИФРОВАННЫМ ключом волта (DEK) в отдельной локальной
 * коллекции. Коллекция НЕ входит в список синхронизируемых, поэтому код не уезжает
 * на сервер. Читается только при разблокированном волте.
 */
const CFG_COLLECTION = 'synccfg'
const CFG_ID = 'code'

export interface SyncConfigStore {
  read(): Promise<string | undefined>
  write(code: string): Promise<void>
  clear(): Promise<void>
}

export interface SyncConfigDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

export function createSyncConfigStore(deps: SyncConfigDeps): SyncConfigStore {
  const { repository, crypto, vault } = deps
  const encode = (value: unknown): Uint8Array =>
    new TextEncoder().encode(JSON.stringify(value))

  return {
    async read(): Promise<string | undefined> {
      const env = await repository.getBlob(CFG_COLLECTION, CFG_ID)
      if (!env) {
        return undefined
      }
      try {
        const decoded = JSON.parse(
          new TextDecoder().decode(crypto.decrypt(vault.requireKey(), env)),
        ) as { code?: string }
        return decoded.code
      } catch {
        return undefined
      }
    },
    async write(code: string): Promise<void> {
      await repository.putBlob(
        CFG_COLLECTION,
        CFG_ID,
        crypto.encrypt(vault.requireKey(), encode({ code })),
      )
    },
    async clear(): Promise<void> {
      await repository.deleteBlob(CFG_COLLECTION, CFG_ID)
    },
  }
}
