import { createContext, useContext } from 'react'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

/** Сервисы ядра, доступные модулям-фичам (через контекст, без импорта из app). */
export interface Services {
  crypto: CryptoService
  repository: Repository
  vault: VaultService
}

const ServicesContext = createContext<Services | null>(null)

export const ServicesProvider = ServicesContext.Provider

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) {
    throw new Error('useServices: отсутствует ServicesProvider')
  }
  return services
}
