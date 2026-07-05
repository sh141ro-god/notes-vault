import { useState } from 'react'

import { useSyncController } from '@core/sync/SyncContext.ts'
import { MIN_PASSPHRASE_LENGTH } from '@core/vault/secretPolicy.ts'

import { useVaultStore } from './VaultContext.ts'
import { vaultErrorMessage } from './vaultErrorMessage.ts'

/** Первичная настройка: создать новый волт ИЛИ присоединиться по коду синхронизации. */
export function SetupScreen(): React.JSX.Element {
  const store = useVaultStore()
  const sync = useSyncController()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [joinCode, setJoinCode] = useState('')
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

  async function join(): Promise<void> {
    setError(undefined)
    setBusy(true)
    try {
      // Скачиваем зашифрованный волт по коду; затем гейт увидит волт и покажет
      // экран разблокировки — вводите кодовую фразу с исходного устройства.
      await sync.bootstrapWithCode(joinCode)
      await store.initialize()
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
        <button type="submit" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать волт'}
        </button>
      </form>

      <h2>Уже есть волт на другом устройстве?</h2>
      <p className="vault-warn">
        Введите код синхронизации с того устройства — волт скачается сюда, и вы
        войдёте своей кодовой фразой.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void join()
        }}
      >
        <label className="vault-field">
          Код синхронизации
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={joinCode}
            onChange={(event) => {
              setJoinCode(event.target.value)
            }}
          />
        </label>
        <button type="submit" disabled={busy || joinCode.trim() === ''}>
          Присоединиться по коду
        </button>
      </form>

      {error !== undefined && (
        <p className="vault-error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
