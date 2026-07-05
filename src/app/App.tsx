import { useMemo } from 'react'

import { PwaUpdater } from '@core/pwa/PwaUpdater.tsx'
import { ServicesProvider } from '@core/services/ServicesContext.ts'
import { AppShell } from '@core/shell/AppShell.tsx'
import { SyncProvider } from '@core/sync/SyncContext.ts'
import { VaultStoreProvider } from '@core/vault-ui/VaultContext.ts'
import { VaultGate } from '@core/vault-ui/VaultGate.tsx'
import { createVaultStore } from '@core/vault-ui/vaultStore.ts'

import type { AppContainer } from './di.ts'

interface AppProps {
  container: AppContainer
}

/**
 * Корень UI: сервисы ядра доступны модулям через ServicesProvider; контроллер
 * синхронизации — через SyncProvider; гейт волта монтирует оболочку с модулями
 * только после разблокировки.
 */
export function App({ container }: AppProps): React.JSX.Element {
  const store = useMemo(
    () =>
      createVaultStore({
        vault: container.vault,
        repository: container.repository,
      }),
    [container],
  )
  const services = useMemo(
    () => ({
      crypto: container.crypto,
      repository: container.repository,
      vault: container.vault,
    }),
    [container],
  )

  return (
    <ServicesProvider value={services}>
      <SyncProvider value={container.sync}>
        <VaultStoreProvider value={store}>
          <VaultGate>
            <AppShell modules={container.modules} />
          </VaultGate>
        </VaultStoreProvider>
      </SyncProvider>
      <PwaUpdater />
    </ServicesProvider>
  )
}
