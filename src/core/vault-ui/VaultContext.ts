import { createContext, useContext, useSyncExternalStore } from 'react'

import type { VaultSnapshot, VaultStore } from './vaultStore.ts'

const VaultStoreContext = createContext<VaultStore | null>(null)

export const VaultStoreProvider = VaultStoreContext.Provider

export function useVaultStore(): VaultStore {
  const store = useContext(VaultStoreContext)
  if (!store) {
    throw new Error('useVaultStore: отсутствует VaultStoreProvider')
  }
  return store
}

export function useVaultSnapshot(): VaultSnapshot {
  const store = useVaultStore()
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  )
}
