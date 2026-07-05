import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { createTag } from './tagModel.ts'
import { createTagRepository, type TagRepository } from './tagRepository.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }

let crypto: CryptoService
let counter = 0

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

let tagRepo: TagRepository

beforeEach(async () => {
  counter += 1
  const sodium = await loadSodium()
  const repository = createIdbRepository(`tags-test-${String(counter)}`)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
  })
  await vault.setup('correct horse battery staple')
  tagRepo = createTagRepository({ repository, crypto, vault })
})

describe('реестр тегов', () => {
  it('сохраняет тег и отдаёт имя в индексе (без расшифровки тела)', async () => {
    const tag = createTag('Работа', '#3b82f6')
    await tagRepo.save(tag)

    const index = await tagRepo.listIndex()
    expect(index.map((e) => e.title)).toEqual(['Работа'])
    expect((await tagRepo.get(tag.id))?.color).toBe('#3b82f6')
  })

  it('удаление убирает тег из реестра', async () => {
    const tag = createTag('Личное')
    await tagRepo.save(tag)
    await tagRepo.remove(tag.id)
    expect(await tagRepo.listIndex()).toEqual([])
  })
})
