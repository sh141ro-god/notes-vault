import { useState } from 'react'

import { useVaultSnapshot, useVaultStore } from './VaultContext.ts'
import { vaultErrorMessage } from './vaultErrorMessage.ts'

type UnlockMode = 'passphrase' | 'pin' | 'recovery'

const MODE_LABELS: Record<UnlockMode, string> = {
  passphrase: 'Кодовая фраза',
  pin: 'PIN',
  recovery: 'Ключ восстановления',
}

/** Экран разблокировки (он же lock-screen): фраза / PIN / ключ восстановления. */
export function UnlockScreen(): React.JSX.Element {
  const store = useVaultStore()
  const snap = useVaultSnapshot()
  const pinUsable = snap.pinAvailable && snap.status !== 'recoveryOnly'

  const [mode, setMode] = useState<UnlockMode>(pinUsable ? 'pin' : 'passphrase')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const activeMode: UnlockMode =
    mode === 'pin' && !pinUsable ? 'passphrase' : mode

  function switchMode(next: UnlockMode): void {
    setMode(next)
    setValue('')
    setError(undefined)
  }

  async function submit(): Promise<void> {
    setError(undefined)
    setBusy(true)
    try {
      if (activeMode === 'passphrase') {
        await store.unlockWithPassphrase(value)
      } else if (activeMode === 'pin') {
        await store.unlockWithPin(value)
      } else {
        await store.unlockWithRecovery(value)
      }
    } catch (err) {
      setError(vaultErrorMessage(err))
      setValue('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="vault-screen">
      <h1>Разблокировка</h1>
      <div className="vault-tabs" role="tablist">
        {pinUsable && (
          <button
            type="button"
            aria-selected={activeMode === 'pin'}
            onClick={() => {
              switchMode('pin')
            }}
          >
            {MODE_LABELS.pin}
          </button>
        )}
        <button
          type="button"
          aria-selected={activeMode === 'passphrase'}
          onClick={() => {
            switchMode('passphrase')
          }}
        >
          {MODE_LABELS.passphrase}
        </button>
        <button
          type="button"
          aria-selected={activeMode === 'recovery'}
          onClick={() => {
            switchMode('recovery')
          }}
        >
          {MODE_LABELS.recovery}
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          type="password"
          autoComplete="off"
          inputMode={activeMode === 'pin' ? 'numeric' : 'text'}
          aria-label={MODE_LABELS[activeMode]}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
          }}
        />
        {error !== undefined && (
          <p className="vault-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Проверяем…' : 'Разблокировать'}
        </button>
      </form>
    </main>
  )
}
