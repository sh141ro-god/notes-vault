import type { Repository } from '@core/storage/repository.ts'
import type { VaultService, VaultStatus } from '@core/vault/vaultState.ts'

/** Реактивный снимок состояния волта для UI. */
export interface VaultSnapshot {
  readonly status: VaultStatus
  /** Настроен ли быстрый вход по PIN (есть PIN-обёртка). */
  readonly pinAvailable: boolean
  /** Одноразовый ключ восстановления сразу после setup (показать и забыть). */
  readonly pendingRecoveryCode: string | undefined
}

export interface VaultStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): VaultSnapshot
  initialize(): Promise<void>
  setup(passphrase: string): Promise<void>
  /** Подтвердить, что recovery-код сохранён — очищает его из памяти. */
  acknowledgeRecovery(): void
  unlockWithPassphrase(passphrase: string): Promise<void>
  unlockWithPin(pin: string): Promise<void>
  unlockWithRecovery(code: string): Promise<void>
  enablePin(pin: string): Promise<void>
  /** Меняет кодовую фразу (перешифровывает только обёртку под фразой). */
  changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void>
  /** Генерирует новый ключ восстановления и показывает его (pendingRecoveryCode). */
  regenerateRecoveryCode(): Promise<void>
  lock(): void
}

export interface VaultStoreDeps {
  vault: VaultService
  repository: Repository
}

/**
 * Тонкий реактивный слой над VaultService (совместим с useSyncExternalStore).
 * Держит снимок статуса, доступность PIN и одноразовый recovery-код. Сам по себе
 * без таймеров и DOM — авто-лок подключается в React-слое (VaultGate).
 */
export function createVaultStore(deps: VaultStoreDeps): VaultStore {
  const { vault, repository } = deps
  const listeners = new Set<() => void>()
  let pinAvailable = false
  let pendingRecoveryCode: string | undefined
  let snapshot: VaultSnapshot = {
    status: vault.status(),
    pinAvailable,
    pendingRecoveryCode,
  }

  function emit(): void {
    snapshot = { status: vault.status(), pinAvailable, pendingRecoveryCode }
    for (const listener of listeners) {
      listener()
    }
  }

  async function refreshPinAvailable(): Promise<void> {
    const meta = await repository.readVaultMeta()
    pinAvailable = meta?.wrappedDek.pin !== undefined
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot(): VaultSnapshot {
      return snapshot
    },

    async initialize(): Promise<void> {
      await vault.initialize()
      await refreshPinAvailable()
      emit()
    },

    async setup(passphrase: string): Promise<void> {
      const { recoveryCode } = await vault.setup(passphrase)
      pendingRecoveryCode = recoveryCode
      await refreshPinAvailable()
      emit()
    },

    acknowledgeRecovery(): void {
      pendingRecoveryCode = undefined
      emit()
    },

    async unlockWithPassphrase(passphrase: string): Promise<void> {
      await vault.unlockWithPassphrase(passphrase)
      await refreshPinAvailable()
      emit()
    },

    async unlockWithPin(pin: string): Promise<void> {
      try {
        await vault.unlockWithPin(pin)
      } finally {
        // статус мог стать recoveryOnly, а PIN-обёртка — стереться
        await refreshPinAvailable()
        emit()
      }
    },

    async unlockWithRecovery(code: string): Promise<void> {
      await vault.unlockWithRecovery(code)
      await refreshPinAvailable()
      emit()
    },

    async enablePin(pin: string): Promise<void> {
      await vault.enablePin(pin)
      await refreshPinAvailable()
      emit()
    },

    async changePassphrase(
      oldPassphrase: string,
      newPassphrase: string,
    ): Promise<void> {
      await vault.changePassphrase(oldPassphrase, newPassphrase)
      emit()
    },

    async regenerateRecoveryCode(): Promise<void> {
      const { recoveryCode } = await vault.changeRecoveryCode()
      pendingRecoveryCode = recoveryCode
      emit()
    },

    lock(): void {
      vault.lock()
      emit()
    },
  }
}
