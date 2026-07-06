import type { Envelope } from '@core/crypto/envelope.ts'

import type {
  Collection,
  Repository,
  RepositorySnapshot,
} from './repository.ts'

/**
 * Декоратор Repository: дёргает `notify` после каждой ДОМЕННОЙ мутации —
 * атомарной записи/удаления (save/remove модулей) и полной замены (импорт).
 * Через это ядро синхронизации узнаёт «локальные данные изменились» сразу,
 * не дожидаясь периодического тика (push-on-save).
 *
 * Сознательно НЕ оборачиваются putBlob/deleteBlob/putManifest: ими пользуется
 * сам sync при применении удалённых изменений и reindex — уведомление о них
 * зациклило бы синхронизацию на самой себе.
 */
export function withWriteNotifier(
  repo: Repository,
  notify: () => void,
): Repository {
  return {
    ...repo,

    async writeBlobWithManifest(
      collection: Collection,
      id: string,
      blob: Envelope,
      manifest: Envelope,
    ): Promise<void> {
      await repo.writeBlobWithManifest(collection, id, blob, manifest)
      notify()
    },

    async deleteBlobWithManifest(
      collection: Collection,
      id: string,
      manifest: Envelope,
      tombstoneAt: number,
    ): Promise<void> {
      await repo.deleteBlobWithManifest(collection, id, manifest, tombstoneAt)
      notify()
    },

    async replaceAll(snapshot: RepositorySnapshot): Promise<void> {
      await repo.replaceAll(snapshot)
      notify()
    },
  }
}
