import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

import type { SyncController, SyncState } from './syncController.ts'

const SyncContext = createContext<SyncController | null>(null)

export const SyncProvider = SyncContext.Provider

export function useSyncController(): SyncController {
  const controller = useContext(SyncContext)
  if (!controller) {
    throw new Error('useSyncController: отсутствует SyncProvider')
  }
  return controller
}

/** Реактивное состояние синхронизации (для UI). */
export function useSyncState(): SyncState {
  const controller = useSyncController()
  const subscribe = useCallback(
    (onChange: () => void) => controller.subscribe(onChange),
    [controller],
  )
  const getSnapshot = useCallback(() => controller.getState(), [controller])
  return useSyncExternalStore(subscribe, getSnapshot)
}
