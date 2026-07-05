import { useState } from 'react'

import {
  MIN_PASSPHRASE_LENGTH,
  MIN_PIN_LENGTH,
} from '@core/vault/secretPolicy.ts'

import { useVaultSnapshot, useVaultStore } from './VaultContext.ts'
import { vaultErrorMessage } from './vaultErrorMessage.ts'

interface SettingsProps {
  onClose: () => void
}

/** Настройки разблокированного волта: смена фразы, быстрый вход по PIN, ключ восстановления. */
export function Settings({ onClose }: SettingsProps): React.JSX.Element {
  const store = useVaultStore()
  const snap = useVaultSnapshot()
  const [pin, setPin] = useState('')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [info, setInfo] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  async function changePassphrase(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    if (newPass.length < MIN_PASSPHRASE_LENGTH) {
      setError(
        `Новая фраза должна быть не короче ${String(MIN_PASSPHRASE_LENGTH)} символов`,
      )
      return
    }
    setBusy(true)
    try {
      await store.changePassphrase(oldPass, newPass)
      setOldPass('')
      setNewPass('')
      setInfo('Кодовая фраза изменена.')
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function enablePin(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`PIN должен быть не короче ${String(MIN_PIN_LENGTH)} символов`)
      return
    }
    setBusy(true)
    try {
      await store.enablePin(pin)
      setPin('')
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function regenerate(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    setBusy(true)
    try {
      // После этого гейт покажет одноразовый экран нового ключа восстановления.
      await store.regenerateRecoveryCode()
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vault-screen">
      <header className="vault-settings__header">
        <h1>Настройки</h1>
        <button type="button" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <h2>Кодовая фраза</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void changePassphrase()
        }}
      >
        <label className="vault-field">
          Текущая фраза
          <input
            type="password"
            autoComplete="current-password"
            value={oldPass}
            onChange={(event) => {
              setOldPass(event.target.value)
            }}
          />
        </label>
        <label className="vault-field">
          Новая фраза (минимум {MIN_PASSPHRASE_LENGTH})
          <input
            type="password"
            autoComplete="new-password"
            value={newPass}
            onChange={(event) => {
              setNewPass(event.target.value)
            }}
          />
        </label>
        <button type="submit" disabled={busy}>
          Сменить фразу
        </button>
      </form>

      <h2>Быстрый вход (PIN)</h2>
      <p className="vault-warn">
        PIN — компромисс удобства: короткий код снижает защиту, если устройство
        украдут. Он привязан к этому устройству и не переносится с экспортом.
      </p>
      {snap.pinAvailable ? (
        <p>PIN включён.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void enablePin()
          }}
        >
          <label className="vault-field">
            Новый PIN (минимум {MIN_PIN_LENGTH})
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value)
              }}
            />
          </label>
          <button type="submit" disabled={busy}>
            Включить PIN
          </button>
        </form>
      )}

      <h2>Ключ восстановления</h2>
      <p className="vault-warn">
        Если вы потеряли свой ключ восстановления — сгенерируйте новый. Старый
        код после этого перестанет работать.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void regenerate()
        }}
      >
        Сгенерировать новый ключ восстановления
      </button>

      {info !== undefined && <p className="vault-info">{info}</p>}
      {error !== undefined && (
        <p className="vault-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
