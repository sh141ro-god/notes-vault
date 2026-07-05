import type { ManifestEntry } from '@core/storage/manifest.ts'

import type { TaskRepository } from './taskRepository.ts'

/**
 * Загружает индекс задач из манифеста; если у записей нет `progress` (волт,
 * сохранённый до проектора v3), однократно перестраивает индекс и читает снова.
 * Общий помощник для списка задач, главной и календаря — единый backfill.
 */
export async function loadTaskIndex(
  repo: TaskRepository,
): Promise<ManifestEntry[]> {
  const index = await repo.listIndex()
  if (index.length > 0 && index.some((entry) => entry.progress === undefined)) {
    await repo.reindex()
    return repo.listIndex()
  }
  return index
}
