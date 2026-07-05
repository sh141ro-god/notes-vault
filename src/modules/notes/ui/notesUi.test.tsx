// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import {
  type Services,
  ServicesProvider,
} from '@core/services/ServicesContext.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { createNote, type Note } from '../model.ts'
import { createNoteRepository } from '../noteRepository.ts'
import { NotesScreen } from './NotesScreen.tsx'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }

let crypto: CryptoService
let counter = 0
let services: Services

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

afterEach(() => {
  cleanup()
})

beforeEach(async () => {
  counter += 1
  const sodium = await loadSodium()
  const repository = createIdbRepository(`notes-ui-${String(counter)}`)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
  })
  await vault.setup('correct horse battery staple')
  services = { crypto, repository, vault }
})

async function seedNote(title: string, body = ''): Promise<Note> {
  const note: Note = { ...createNote(), title, body }
  await createNoteRepository(services).save(note)
  return note
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ServicesProvider value={services}>
        <Routes>
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/notes/:id" element={<NotesScreen />} />
        </Routes>
      </ServicesProvider>
    </MemoryRouter>,
  )
}

describe('NotesScreen', () => {
  it('показывает сохранённую заметку в списке', async () => {
    await seedNote('Моя заметка')
    renderAt('/notes')
    expect(await screen.findByText('Моя заметка')).toBeTruthy()
  })

  it('пустое состояние без заметок', async () => {
    renderAt('/notes')
    expect(await screen.findByText('Пока нет заметок.')).toBeTruthy()
  })

  it('открывает заметку по маршруту /notes/:id', async () => {
    const note = await seedNote('Редактируемая', 'тело')
    renderAt(`/notes/${note.id}`)
    // Заголовок присутствует и в списке слева, и в карточке справа.
    const hits = await screen.findAllByText('Редактируемая')
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })
})
