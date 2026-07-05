import { useState } from 'react'

import { MIN_PASSPHRASE_LENGTH } from '@core/vault/secretPolicy.ts'

import { useVaultStore } from './VaultContext.ts'
import { vaultErrorMessage } from './vaultErrorMessage.ts'

/** Первичная настройка: ввод кодовой фразы и создание волта. */
export function SetupScreen(): React.JSX.Element {
  const store = useVaultStore()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    setError(undefined)
    if (passphrase !== confirm) {
      setError('Фразы не совпадают')
      return
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(
        `Кодовая фраза должна быть не короче ${String(MIN_PASSPHRASE_LENGTH)} символов`,
      )
      return
    }
    setBusy(true)
    try {
      await store.setup(passphrase)
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="vault-screen">
      <h1>Создание волта</h1>
      <p className="vault-warn">
        Запомните кодовую фразу. Без неё и без ключа восстановления данные
        восстановить невозможно — резервной копии у нас нет.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="vault-field">
          Кодовая фраза
          <input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value)
            }}
          />
        </label>
        <label className="vault-field">
          Повторите фразу
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value)
            }}
          />
        </label>
        {error !== undefined && (
          <p className="vault-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать волт'}
        </button>
      </form>
    </main>
  )
}
