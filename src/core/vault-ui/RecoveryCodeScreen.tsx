import { useState } from 'react'

import { useVaultStore } from './VaultContext.ts'

interface RecoveryCodeScreenProps {
  code: string
}

/** Одноразовый показ ключа восстановления с обязательным подтверждением. */
export function RecoveryCodeScreen({
  code,
}: RecoveryCodeScreenProps): React.JSX.Element {
  const store = useVaultStore()
  const [saved, setSaved] = useState(false)

  return (
    <main className="vault-screen">
      <h1>Ключ восстановления</h1>
      <p className="vault-warn">
        Это единственный способ войти, если вы забудете кодовую фразу. Сохраните
        его офлайн (на бумаге или в менеджере паролей). Код показывается ОДИН раз
        и больше не будет доступен.
      </p>
      <code className="vault-recovery">{code}</code>
      <label className="vault-check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked)
          }}
        />
        Я сохранил ключ восстановления в надёжном месте
      </label>
      <button
        type="button"
        disabled={!saved}
        onClick={() => {
          store.acknowledgeRecovery()
        }}
      >
        Продолжить
      </button>
    </main>
  )
}
