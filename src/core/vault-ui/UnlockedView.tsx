import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { useSyncController } from '@core/sync/SyncContext.ts'
import { createLockController } from '@core/vault/lockController.ts'

import { Settings } from './Settings.tsx'
import { useVaultStore } from './VaultContext.ts'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000
// Тик лёгкий (1 запрос версии, полный sync только при изменениях) — можно чаще.
const AUTO_SYNC_MS = 15 * 1000

interface UnlockedViewProps {
  children: ReactNode
}

/**
 * Разблокированное приложение: авто-лок по бездействию/сворачиванию, авто-
 * синхронизация (если включена) и ненавязчивые контролы в углу.
 */
export function UnlockedView({ children }: UnlockedViewProps): React.JSX.Element {
  const store = useVaultStore()
  const sync = useSyncController()
  const [showSettings, setShowSettings] = useState(false)

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

  // Авто-синхронизация: завершить возможное присоединение по коду, поднять
  // синхронизацию из сохранённого кода (с первой синхронизацией) и повторять
  // периодически. Все вызовы безопасны, когда синхронизация выключена (no-op).
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
    // Возвращение в приложение (вкладка снова видима) — сразу проверить новое,
    // не дожидаясь тика: телефон подтягивает правки в момент открытия.
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

  return (
    <>
      {children}
      <div className="vault-controls">
        <button
          type="button"
          onClick={() => {
            setShowSettings(true)
          }}
        >
          Настройки
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            store.lock()
          }}
        >
          Заблокировать
        </button>
      </div>
      {showSettings && (
        <div
          className="vault-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div className="vault-modal">
            <Settings
              onClose={() => {
                setShowSettings(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
