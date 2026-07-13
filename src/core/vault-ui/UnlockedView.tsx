import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { useSyncController } from '@core/sync/SyncContext.ts'
import { createLockController } from '@core/vault/lockController.ts'

import { useVaultStore } from './VaultContext.ts'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000
// Тик лёгкий (1 запрос версии, полный sync только при изменениях) — можно чаще.
const AUTO_SYNC_MS = 15 * 1000

interface UnlockedViewProps {
  children: ReactNode
}

/**
 * Разблокированное приложение: авто-лок по бездействию/сворачиванию и авто-
 * синхронизация (если включена). Контролы «Настройки/Заблокировать» — в меню
 * (drawer оболочки), см. Shell.
 */
export function UnlockedView({ children }: UnlockedViewProps): React.JSX.Element {
  const store = useVaultStore()
  const sync = useSyncController()

  useEffect(() => {
    const controller = createLockController({
      onLock: () => {
        store.lock()
      },
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    })
    controller.start()
    return () => {
      controller.stop()
    }
  }, [store])

  // Авто-синхронизация: завершить возможное присоединение по коду, поднять из
  // сохранённого кода и повторять периодически; плюс проверка при возвращении
  // в приложение. Все вызовы безопасны, когда синхронизация выключена (no-op).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await sync.finishJoin()
      await sync.resume()
    })()
    const timer = setInterval(() => {
      if (!cancelled) {
        void sync.tick()
      }
    }, AUTO_SYNC_MS)
    const onVisible = (): void => {
      if (!cancelled && document.visibilityState === 'visible') {
        void sync.tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync])

  return <>{children}</>
}
