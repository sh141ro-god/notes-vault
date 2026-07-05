import type { CryptoService } from '@core/crypto/cryptoService.ts'
import {
  type CollectionRepository,
  createCollectionRepository,
} from '@core/storage/collectionRepository.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { type Tag, TagSchema } from './tagModel.ts'

/**
 * Реестр тегов — общая (между заметками и задачами) коллекция в ЯДРЕ. Поскольку
 * фабрика без состояния, любой потребитель может создать свой экземпляр над той
 * же коллекцией `tags` — все они согласованы. Имя тега денормализуется в
 * `title` индекса (внутри зашифрованного манифеста), что даёт дешёвый список и
 * резолв id→имя без расшифровки тел.
 */
export type TagRepository = CollectionRepository<Tag>

export interface TagRepositoryDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

export function createTagRepository(deps: TagRepositoryDeps): TagRepository {
  return createCollectionRepository<Tag>({
    collection: 'tags',
    schema: TagSchema,
    toIndex: (tag) => ({ title: tag.name }),
    ...deps,
  })
}
