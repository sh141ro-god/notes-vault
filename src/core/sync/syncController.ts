import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { Sodium } from '@core/crypto/sodium.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { createHttpSyncTarget } from './httpSyncTarget.ts'
import { createSyncConfigStore } from './syncConfig.ts'
import { deriveSyncIdentity, generateSyncCode } from './syncCode.ts'
import { createSyncService, type SyncCollection } from './syncService.ts'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

export interface SyncState {
  status: SyncStatus
  /** Код синхронизации (когда включено) — показать пользователю. */
  code: string | undefined
  lastSyncAt: number | undefined
  error: string | undefined
}

export interface SyncController {
  getState(): SyncState
  subscribe(listener: () => void): () => void
  /**
   * Сигнал «локальные данные изменились»: планирует sync с коротким дебаунсом,
   * чтобы правка уезжала на сервер сразу после сохранения, а серия правок —
   * одним циклом. No-op, когда синхронизация выключена.
   */
  notifyLocalChange(): void
  /**
   * Лёгкий периодический тик: если есть локальные изменения — полный sync;
   * иначе 1 запросом сверяет версию корзины и синкается только при отличии.
   */
  tick(): Promise<void>
  /** Включить на ЭТОМ устройстве: сгенерировать код и выгрузить волт. */
  enable(): Promise<string>
  /** Включить с УЖЕ существующим кодом (присоединиться к общей корзине). */
  enableWithCode(code: string): Promise<void>
  /** Тихо поднять синхронизацию из сохранённого кода (после разблокировки). */
  resume(): Promise<void>
  /** Присоединиться на новом устройстве: скачать волт по коду (до разблокировки). */
  bootstrapWithCode(code: string): Promise<void>
  /** Завершить присоединение после разблокировки: сохранить код и включить. */
  finishJoin(): Promise<void>
  syncNow(): Promise<void>
  disable(): Promise<void>
}

export interface SyncControllerDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
  sodium: Sodium
  collections: SyncCollection[]
  /** База API синхронизации (пусто = тот же origin). */
  baseUrl?: string
}

export function createSyncController(deps: SyncControllerDeps): SyncController {
  const config = createSyncConfigStore(deps)
  const listeners = new Set<() => void>()
  let state: SyncState = {
    status: 'off',
    code: undefined,
    lastSyncAt: undefined,
    error: undefined,
  }
  let service: ReturnType<typeof createSyncService> | undefined
  let pendingJoinCode: string | undefined
  /** Версия корзины после последнего успешного цикла (undefined = неизвестна). */
  let lastVer: string | null | undefined
  /** Есть несинхронизированные локальные изменения. */
  let dirty = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const PUSH_DEBOUNCE_MS = 2000

  function setState(patch: Partial<SyncState>): void {
    state = { ...state, ...patch }
    for (const listener of listeners) {
      listener()
    }
  }

  function buildService(code: string): ReturnType<typeof createSyncService> {
    const identity = deriveSyncIdentity(deps.sodium, code)
    const target = createHttpSyncTarget({
      ...(deps.baseUrl !== undefined ? { baseUrl: deps.baseUrl } : {}),
      syncId: identity.syncId,
      authToken: identity.authToken,
    })
    return createSyncService({
      repository: deps.repository,
      crypto: deps.crypto,
      vault: deps.vault,
      collections: deps.collections,
      target,
    })
  }

  async function runSync(): Promise<void> {
    if (!service) {
      return
    }
    setState({ status: 'syncing', error: undefined })
    try {
      const summary = await service.syncNow()
      lastVer = summary.ver
      dirty = false
      setState({ status: 'ok', lastSyncAt: Date.now() })
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function unlocked(): boolean {
    return deps.vault.status() === 'unlocked'
  }

  return {
    getState(): SyncState {
      return state
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async enable(): Promise<string> {
      const code = generateSyncCode(deps.sodium)
      service = buildService(code)
      await config.write(code)
      setState({ status: 'idle', code })
      await runSync()
      return code
    },

    async enableWithCode(code: string): Promise<void> {
      service = buildService(code)
      await config.write(code)
      setState({ status: 'idle', code })
      await runSync()
    },

    async resume(): Promise<void> {
      const code = await config.read()
      if (!code) {
        return
      }
      service = buildService(code)
      setState({ status: 'idle', code })
      await runSync()
    },

    async bootstrapWithCode(code: string): Promise<void> {
      const joining = buildService(code)
      await joining.bootstrap()
      pendingJoinCode = code
    },

    async finishJoin(): Promise<void> {
      if (!pendingJoinCode) {
        return
      }
      const code = pendingJoinCode
      pendingJoinCode = undefined
      service = buildService(code)
      await config.write(code)
      setState({ status: 'idle', code })
      await runSync()
    },

    async syncNow(): Promise<void> {
      await runSync()
    },

    notifyLocalChange(): void {
      if (!service) {
        return
      }
      dirty = true
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        // Волт мог залочиться за время дебаунса — тогда просто ждём следующей
        // разблокировки (resume сделает полный sync).
        if (dirty && unlocked()) {
          void runSync()
        }
      }, PUSH_DEBOUNCE_MS)
    },

    async tick(): Promise<void> {
      if (!service || !unlocked() || state.status === 'syncing') {
        return
      }
      if (dirty) {
        await runSync()
        return
      }
      try {
        const ver = await service.remoteVersion()
        if (ver !== lastVer) {
          await runSync()
        }
      } catch {
        // Тихий тик: сеть моргнула — не пугаем баннером, следующий тик повторит.
      }
    },

    async disable(): Promise<void> {
      await config.clear()
      service = undefined
      lastVer = undefined
      dirty = false
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }
      setState({ status: 'off', code: undefined, error: undefined })
    },
  }
}
