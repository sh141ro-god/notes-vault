import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

import { createNote, encodeNote, type Note } from './model.ts'
import { createNoteRepository, type NoteRepository } from './noteRepository.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }

let crypto: CryptoService
let counter = 0
let notes: NoteRepository
let repository: ReturnType<typeof createIdbRepository>
let vault: VaultService

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

beforeEach(async () => {
  counter += 1
  const sodium = await loadSodium()
  repository = createIdbRepository(`notes-test-${String(counter)}`)
  vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
  })
  await vault.setup('correct horse battery staple')
  notes = createNoteRepository({ repository, crypto, vault })
})

function noteWith(title: string, body = ''): Note {
  return { ...createNote(), title, body }
}

describe('NoteRepository — CRUD', () => {
  it('save → get round-trip', async () => {
    const note = noteWith('Покупки', '# молоко')
    await notes.save(note)
    const got = await notes.get(note.id)
    expect(got?.title).toBe('Покупки')
    expect(got?.body).toBe('# молоко')
  })

  it('listIndex содержит заголовок без расшифровки тела', async () => {
    const note = noteWith('Заголовок')
    await notes.save(note)
    const index = await notes.listIndex()
    expect(index).toHaveLength(1)
    expect(index[0]?.title).toBe('Заголовок')
  })

  it('listAll и listIndex сортируют по updatedAt (новые сверху)', async () => {
    await notes.save({ ...noteWith('A'), updatedAt: 1000 })
    await notes.save({ ...noteWith('B'), updatedAt: 2000 })
    expect((await notes.listAll()).map((n) => n.title)).toEqual(['B', 'A'])
    expect((await notes.listIndex()).map((e) => e.title)).toEqual(['B', 'A'])
  })

  it('remove удаляет заметку и запись индекса', async () => {
    const note = noteWith('Удалить')
    await notes.save(note)
    await notes.remove(note.id)
    expect(await notes.get(note.id)).toBeUndefined()
    expect(await notes.listIndex()).toHaveLength(0)
  })

  it('обновление не плодит дубликат', async () => {
    const note = noteWith('v1')
    await notes.save(note)
    await notes.save({ ...note, title: 'v2', updatedAt: note.updatedAt + 1 })
    const index = await notes.listIndex()
    expect(index).toHaveLength(1)
    expect(index[0]?.title).toBe('v2')
  })
})

describe('NoteRepository — безопасность и устойчивость', () => {
  it('блоб на диске зашифрован (заголовок не виден)', async () => {
    const note = noteWith('СУПЕРСЕКРЕТНЫЙ', 'тело')
    await notes.save(note)
    const env = await repository.getBlob('notes', note.id)
    expect(new TextDecoder().decode(env?.ct)).not.toContain('СУПЕРСЕКРЕТНЫЙ')
  })

  it('listAll пропускает непарсящийся блоб', async () => {
    await notes.save(noteWith('Хорошая'))
    await repository.putBlob(
      'notes',
      createNote().id,
      crypto.encrypt(vault.requireKey(), new TextEncoder().encode('{битый')),
    )
    expect((await notes.listAll()).map((n) => n.title)).toEqual(['Хорошая'])
  })

  it('reindex подхватывает осиротевший блоб в индекс', async () => {
    const orphan: Note = { ...createNote(), title: 'Сирота', updatedAt: 5000 }
    await repository.putBlob(
      'notes',
      orphan.id,
      crypto.encrypt(vault.requireKey(), encodeNote(orphan)),
    )
    await notes.reindex()
    expect((await notes.listIndex()).some((e) => e.title === 'Сирота')).toBe(true)
  })

  it('операции невозможны при заблокированном волте', async () => {
    const note = noteWith('секрет')
    await notes.save(note)
    vault.lock()
    await expect(notes.get(note.id)).rejects.toThrow()
    await expect(notes.listIndex()).rejects.toThrow()
    await expect(notes.listAll()).rejects.toThrow()
  })
})
