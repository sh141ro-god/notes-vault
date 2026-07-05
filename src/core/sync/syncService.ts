import type { CryptoService } from '@core/crypto/cryptoService.ts'
import { parseManifest } from '@core/storage/manifest.ts'
import type { Collection, Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { mergeSync, type SyncItem } from './syncEngine.ts'
import type { SyncTarget } from './syncTarget.ts'
import { envelopeToWire, metaToWire, wireToEnvelope, wireToMeta } from './wire.ts'

/** Коллекция под синхронизацию + способ перестроить её индекс после применения. */
export interface SyncCollection {
  name: Collection
  reindex: () => Promise<void>
}

export interface SyncServiceDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
  collections: SyncCollection[]
  target: SyncTarget
}

export interface SyncSummary {
  pulled: number
  pushed: number
  appliedLocal: number
}

export interface SyncService {
  /** Полный цикл (требует разблокированного волта): pull → merge → apply → push. */
  syncNow(): Promise<SyncSummary>
  /**
   * Первичная загрузка на НОВОМ устройстве (волт ещё заблокирован): скачивает
   * открытую VaultMeta и зашифрованные блобы, чтобы волт «появился». Индексы
   * достроятся первым syncNow после разблокировки.
   */
  bootstrap(): Promise<void>
}

/**
 * Клиентская синхронизация: сводит локальные зашифрованные записи с серверными.
 * Сервер видит только шифртекст; расшифровка/переиндексация — на устройстве с DEK.
 * Операции сериализованы простым мьютексом, чтобы фоновый и ручной sync не
 * накладывались.
 */
export function createSyncService(deps: SyncServiceDeps): SyncService {
  const { repository, crypto, vault, collections, target } = deps

  let mutex: Promise<unknown> = Promise.resolve()
  function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutex.then(operation, operation)
    mutex = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function gatherLocal(): Promise<{ items: SyncItem[]; meta: string | null }> {
    const dek = vault.requireKey()
    const items: SyncItem[] = []
    for (const col of collections) {
      const manifestEnv = await repository.getManifest(col.name)
      if (!manifestEnv) {
        continue
      }
      const manifest = parseManifest(
        JSON.parse(new TextDecoder().decode(crypto.decrypt(dek, manifestEnv))),
      )
      for (const entry of manifest.entries) {
        const blob = await repository.getBlob(col.name, entry.id)
        if (!blob) {
          continue
        }
        items.push({
          collection: col.name,
          id: entry.id,
          updatedAt: entry.updatedAt,
          deleted: false,
          ct: envelopeToWire(blob),
        })
      }
    }
    const storedMeta = await repository.readVaultMeta()
    return { items, meta: storedMeta ? metaToWire(storedMeta) : null }
  }

  async function applyRemote(applyLocal: SyncItem[]): Promise<void> {
    const touched = new Set<string>()
    for (const item of applyLocal) {
      if (item.deleted) {
        await repository.deleteBlob(item.collection, item.id)
      } else if (item.ct !== undefined) {
        await repository.putBlob(item.collection, item.id, wireToEnvelope(item.ct))
      }
      touched.add(item.collection)
    }
    for (const col of collections) {
      if (touched.has(col.name)) {
        await col.reindex()
      }
    }
  }

  return {
    syncNow(): Promise<SyncSummary> {
      return runExclusive(async () => {
        const remote = await target.pull()
        const local = await gatherLocal()
        const { applyLocal, push } = mergeSync(local.items, remote.items)
        await applyRemote(applyLocal)
        await target.push(local.meta, push)
        return {
          pulled: remote.items.length,
          pushed: push.length,
          appliedLocal: applyLocal.length,
        }
      })
    },

    bootstrap(): Promise<void> {
      return runExclusive(async () => {
        const remote = await target.pull()
        if (remote.meta !== null && (await repository.readVaultMeta()) === undefined) {
          await repository.writeVaultMeta(wireToMeta(remote.meta))
        }
        for (const item of remote.items) {
          if (!item.deleted && item.ct !== undefined) {
            await repository.putBlob(
              item.collection,
              item.id,
              wireToEnvelope(item.ct),
            )
          }
        }
      })
    },
  }
}
