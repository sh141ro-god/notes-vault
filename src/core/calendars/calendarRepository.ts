import type { CryptoService } from '@core/crypto/cryptoService.ts'
import {
  type CollectionRepository,
  createCollectionRepository,
} from '@core/storage/collectionRepository.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { type Calendar, CalendarSchema } from './calendarEntity.ts'

/** Репозиторий календарей-целей — специализация общей фабрики (коллекция `calendars`). */
export type CalendarRepository = CollectionRepository<Calendar>

export interface CalendarRepositoryDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

export function createCalendarRepository(
  deps: CalendarRepositoryDeps,
): CalendarRepository {
  return createCollectionRepository<Calendar>({
    collection: 'calendars',
    schema: CalendarSchema,
    toIndex: (cal) => ({ title: cal.name }),
    ...deps,
  })
}
