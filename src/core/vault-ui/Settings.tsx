import { useState } from 'react'

import {
  MIN_PASSPHRASE_LENGTH,
  MIN_PIN_LENGTH,
} from '@core/vault/secretPolicy.ts'
import { useSyncController, useSyncState } from '@core/sync/SyncContext.ts'
import type { SyncStatus } from '@core/sync/syncController.ts'

import { useVaultSnapshot, useVaultStore } from './VaultContext.ts'
import { vaultErrorMessage } from './vaultErrorMessage.ts'

interface SettingsProps {
  onClose: () => void
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  off: 'выключена',
  idle: 'готова',
  syncing: 'синхронизируется…',
  ok: 'синхронизировано',
  error: 'ошибка',
}

/** Настройки волта: фраза, PIN, ключ восстановления, синхронизация. */
export function Settings({ onClose }: SettingsProps): React.JSX.Element {
  const store = useVaultStore()
  const snap = useVaultSnapshot()
  const sync = useSyncController()
  const syncState = useSyncState()
  const [pin, setPin] = useState('')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [revealCode, setRevealCode] = useState(false)
  const [joinExisting, setJoinExisting] = useState('')
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
      await store.regenerateRecoveryCode()
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function enableSync(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    setBusy(true)
    try {
      await sync.enable()
      setRevealCode(true)
      setInfo('Синхронизация включена. Сохраните код и введите его на других устройствах.')
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function connectExisting(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    setBusy(true)
    try {
      await sync.enableWithCode(joinExisting.trim())
      setJoinExisting('')
      setInfo('Устройство подключено к синхронизации.')
    } catch (err) {
      setError(vaultErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function disableSync(): Promise<void> {
    setError(undefined)
    setInfo(undefined)
    if (
      !window.confirm(
        'Отключить синхронизацию на этом устройстве? Данные на сервере и других устройствах останутся.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await sync.disable()
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

      <h2>Синхронизация устройств</h2>
      <p className="vault-warn">
        Записи шифруются на устройстве; сервер хранит только шифртекст. Введите код
        на другом устройстве, чтобы данные синхронизировались между ними.
      </p>
      {syncState.status === 'off' ? (
        <>
          <button type="button" disabled={busy} onClick={() => void enableSync()}>
            Включить синхронизацию (создать код)
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void connectExisting()
            }}
          >
            <label className="vault-field">
              …или подключить по коду с другого устройства
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={joinExisting}
                onChange={(event) => {
                  setJoinExisting(event.target.value)
                }}
              />
            </label>
            <button type="submit" disabled={busy || joinExisting.trim() === ''}>
              Подключить по коду
            </button>
          </form>
        </>
      ) : (
        <div className="vault-field">
          <div>
            Код синхронизации:{' '}
            <code className="mono">
              {revealCode ? (syncState.code ?? '—') : '••••-••••-••••'}
            </code>{' '}
            <button
              type="button"
              onClick={() => {
                setRevealCode((v) => !v)
              }}
            >
              {revealCode ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          <p className="mono">
            Статус: {SYNC_LABEL[syncState.status]}
            {syncState.error !== undefined ? ` — ${syncState.error}` : ''}
          </p>
          <div className="transfer__actions">
            <button
              type="button"
              disabled={busy || syncState.status === 'syncing'}
              onClick={() => void sync.syncNow()}
            >
              Синхронизировать сейчас
            </button>
            <button type="button" disabled={busy} onClick={() => void disableSync()}>
              Отключить
            </button>
          </div>
        </div>
      )}

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
