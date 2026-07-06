import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KeyDerivation } from '@core/crypto/keyDerivation.ts'
import type { Sodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import {
  createSodiumKeyDerivation,
  recommendedKdfParams,
  recommendedPinKdfParams,
} from '@core/crypto/sodiumKeyDerivation.ts'
import { createWorkerKeyDerivation } from '@core/crypto/workerKeyDerivation.ts'
import { loadModules } from '@core/registry/moduleRegistry.ts'
import type { ModuleContract } from '@core/registry/moduleContract.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import type { Repository } from '@core/storage/repository.ts'
import { withWriteNotifier } from '@core/storage/writeNotifier.ts'
import { createTagRepository } from '@core/tags/tagRepository.ts'
import { createSyncController } from '@core/sync/syncController.ts'
import type { SyncController } from '@core/sync/syncController.ts'
import { createVaultService } from '@core/vault/vaultService.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { createNoteRepository } from '@modules/notes/noteRepository.ts'
import { createTaskRepository } from '@modules/tasks/taskRepository.ts'

/**
 * Composition root.
 *
 * Единственное место, где конкретные адаптеры подставляются под порты ядра.
 */

export interface AppContainer {
  readonly sodium: Sodium
  readonly crypto: CryptoService
  readonly keyDerivation: KeyDerivation
  readonly repository: Repository
  readonly vault: VaultService
  /** Контроллер синхронизации между устройствами (E2E, сервер хранит шифртекст). */
  readonly sync: SyncController
  readonly modules: ModuleContract[]
}

export interface ContainerDeps {
  readonly sodium: Sodium
}

export function createContainer(deps: ContainerDeps): AppContainer {
  const crypto = createSodiumCryptoService(deps.sodium)
  const keyDerivation =
    typeof Worker === 'undefined'
      ? createSodiumKeyDerivation(deps.sodium)
      : createWorkerKeyDerivation(deps.sodium)
  // Мост «запись → sync»: контроллер создаётся позже репозитория, поэтому
  // уведомление идёт через переприсваиваемую ссылку (заполняется ниже).
  const onLocalWrite: { current?: () => void } = {}
  const repository = withWriteNotifier(createIdbRepository(), () => {
    onLocalWrite.current?.()
  })
  const vault = createVaultService({
    crypto,
    keyDerivation,
    repo: repository,
    kdf: recommendedKdfParams(deps.sodium),
    kdfPin: recommendedPinKdfParams(deps.sodium),
  })

  // Коллекции под синхронизацию: те же репозитории, что и у модулей, с их reindex
  // (перестроить индекс после применения удалённых изменений).
  const noteRepo = createNoteRepository({ repository, crypto, vault })
  const taskRepo = createTaskRepository({ repository, crypto, vault })
  const tagRepo = createTagRepository({ repository, crypto, vault })
  const sync = createSyncController({
    repository,
    crypto,
    vault,
    sodium: deps.sodium,
    collections: [
      { name: 'notes', reindex: () => noteRepo.reindex().then(() => undefined) },
      { name: 'tasks', reindex: () => taskRepo.reindex().then(() => undefined) },
      { name: 'tags', reindex: () => tagRepo.reindex().then(() => undefined) },
    ],
  })

  onLocalWrite.current = () => {
    sync.notifyLocalChange()
  }

  return {
    sodium: deps.sodium,
    crypto,
    keyDerivation,
    repository,
    vault,
    sync,
    modules: loadModules(),
  }
}
