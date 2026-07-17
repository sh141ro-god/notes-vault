import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { createTask } from './model.ts'
import { createTaskRepository } from './taskRepository.ts'

let crypto: CryptoService
beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

describe('calendarId в индексе задач (разделение календарей)', () => {
  it('задачи разных календарей не смешиваются в listIndex', async () => {
    const sodium = await loadSodium()
    const repository = createIdbRepository('cal-sep-1')
    const vault = createVaultService({
      crypto,
      keyDerivation: createSodiumKeyDerivation(sodium),
      repo: repository,
      kdf: { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 },
    })
    await vault.setup('correct horse battery staple')
    const repo = createTaskRepository({ repository, crypto, vault })
    const CAL = '11111111-1111-4111-8111-111111111111'
    await repo.save({ ...createTask('основная'), day: '2026-08-01' })
    await repo.save({ ...createTask('цель'), day: '2026-08-01', calendarId: CAL })
    const idx = await repo.listIndex()
    expect(idx.filter((e) => e.calendarId === undefined).map((e) => e.title)).toEqual([
      'основная',
    ])
    expect(idx.filter((e) => e.calendarId === CAL).map((e) => e.title)).toEqual(['цель'])
  })
})
