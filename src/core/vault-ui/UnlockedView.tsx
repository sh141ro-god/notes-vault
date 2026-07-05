import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { createLockController } from '@core/vault/lockController.ts'

import { Settings } from './Settings.tsx'
import { useVaultStore } from './VaultContext.ts'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

interface UnlockedViewProps {
  children: ReactNode
}

/**
 * Разблокированное приложение: авто-лок по бездействию/сворачиванию + ненавязчивые
 * контролы в углу (настройки и блокировка). Контент (оболочка с сайдбаром)
 * рендерится как есть.
 */
export function UnlockedView({ children }: UnlockedViewProps): React.JSX.Element {
  const store = useVaultStore()
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
