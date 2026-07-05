import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { RecoveryCodeScreen } from './RecoveryCodeScreen.tsx'
import { SetupScreen } from './SetupScreen.tsx'
import { UnlockScreen } from './UnlockScreen.tsx'
import { UnlockedView } from './UnlockedView.tsx'
import { useVaultSnapshot, useVaultStore } from './VaultContext.ts'
import './vault-ui.css'

interface VaultGateProps {
  children: ReactNode
}

/**
 * Гейт волта: модули (children) монтируются только когда статус `unlocked`.
 * Первый запуск → SetupScreen; существующий волт → UnlockScreen; сразу после
 * setup → одноразовый показ recovery-кода. Авто-лок возвращает на экран входа.
 */
export function VaultGate({ children }: VaultGateProps): React.JSX.Element {
  const store = useVaultStore()
  const snap = useVaultSnapshot()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    void store.initialize().finally(() => {
      if (active) {
        setReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [store])

  if (!ready) {
    return (
      <main className="vault-screen">
        <p>Загрузка…</p>
      </main>
    )
  }
  if (snap.pendingRecoveryCode !== undefined) {
    return <RecoveryCodeScreen code={snap.pendingRecoveryCode} />
  }
  if (snap.status === 'unlocked') {
    return <UnlockedView>{children}</UnlockedView>
  }
  if (snap.status === 'uninitialized') {
    return <SetupScreen />
  }
  return <UnlockScreen />
}
