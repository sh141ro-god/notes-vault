import type { CryptoService } from '@core/crypto/cryptoService.ts'
import {
  type CollectionRepository,
  createCollectionRepository,
} from '@core/storage/collectionRepository.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { type Task, TaskSchema, taskProgress } from './model.ts'

export type TaskRepository = CollectionRepository<Task>

export interface TaskRepositoryDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

/**
 * Репозиторий задач — специализация общей фабрики. В индекс манифеста
 * проецируются title, теги, день привязки и прогресс выполнения: этого хватает
 * календарю/главной, чтобы строить статус и раскраску БЕЗ расшифровки тел.
 */
export function createTaskRepository(deps: TaskRepositoryDeps): TaskRepository {
  return createCollectionRepository<Task>({
    collection: 'tasks',
    schema: TaskSchema,
    toIndex: (task) => ({
      title: task.title,
      tagIds: task.tagIds,
      progress: taskProgress(task),
      ...(task.day !== undefined ? { day: task.day } : {}),
      ...(task.calendarId !== undefined ? { calendarId: task.calendarId } : {}),
    }),
    ...deps,
  })
}
