import type { CryptoService } from '@core/crypto/cryptoService.ts'
import {
  type CollectionRepository,
  createCollectionRepository,
} from '@core/storage/collectionRepository.ts'
import type { ManifestIndexFields } from '@core/storage/manifest.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { type Note, NoteSchema } from './model.ts'

/** Репозиторий заметок — специализация общего коллекционного репозитория. */
export type NoteRepository = CollectionRepository<Note>

export interface NoteRepositoryDeps {
  repository: Repository
  crypto: CryptoService
  vault: VaultService
}

function noteIndex(note: Note): ManifestIndexFields {
  const fields: ManifestIndexFields = { title: note.title, tagIds: note.tagIds }
  if (note.lastOpenedAt !== undefined) fields.lastOpenedAt = note.lastOpenedAt
  if (note.openCount !== undefined) fields.openCount = note.openCount
  return fields
}

export function createNoteRepository(deps: NoteRepositoryDeps): NoteRepository {
  return createCollectionRepository<Note>({
    collection: 'notes',
    schema: NoteSchema,
    toIndex: noteIndex,
    ...deps,
  })
}
