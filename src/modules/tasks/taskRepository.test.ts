import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { buildVaultExport } from '../export-import/transfer.ts'
import { createNote, type Note } from '../notes/model.ts'
import { createNoteRepository } from '../notes/noteRepository.ts'
import { createTask } from './model.ts'
import { createTaskRepository } from './taskRepository.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }

let crypto: CryptoService
let counter = 0

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

async function freshVault(): Promise<{
  repository: ReturnType<typeof createIdbRepository>
  noteRepo: ReturnType<typeof createNoteRepository>
  taskRepo: ReturnType<typeof createTaskRepository>
}> {
  counter += 1
  const sodium = await loadSodium()
  const repository = createIdbRepository(`tasks-test-${String(counter)}`)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
  })
  await vault.setup('correct horse battery staple')
  return {
    repository,
    noteRepo: createNoteRepository({ repository, crypto, vault }),
    taskRepo: createTaskRepository({ repository, crypto, vault }),
  }
}

let ctx: Awaited<ReturnType<typeof freshVault>>

beforeEach(async () => {
  ctx = await freshVault()
})

const note = (title: string): Note => ({ ...createNote(), title })

describe('расширяемость: коллекция tasks без правок ядра', () => {
  it('заметки и задачи изолированы в одном волте', async () => {
    await ctx.noteRepo.save(note('Заметка'))
    await ctx.taskRepo.save(createTask('Задача'))

    expect((await ctx.noteRepo.listIndex()).map((e) => e.title)).toEqual([
      'Заметка',
    ])
    const tasks = await ctx.taskRepo.listAll()
    expect(tasks.map((t) => t.title)).toEqual(['Задача'])
    expect(tasks[0]?.done).toBe(false) // форма задачи (done) сохраняется
  })

  it('экспорт волта включает обе коллекции', async () => {
    await ctx.noteRepo.save(note('N'))
    await ctx.taskRepo.save(createTask('T'))
    const exported = await buildVaultExport(ctx.repository)
    expect(exported.collections.map((c) => c.name).sort()).toEqual([
      'notes',
      'tasks',
    ])
  })
})
