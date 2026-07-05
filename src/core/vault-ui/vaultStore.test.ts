import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { createVaultStore, type VaultStore } from './vaultStore.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }
const PASS = 'correct horse battery staple'

let crypto: CryptoService
let counter = 0
let store: VaultStore

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

beforeEach(async () => {
  counter += 1
  const sodium = await loadSodium()
  const repository = createIdbRepository(`store-test-${String(counter)}`)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
    pinMaxFailures: 3,
  })
  store = createVaultStore({ vault, repository })
})

describe('vaultStore', () => {
  it('initialize: первый запуск → uninitialized', async () => {
    await store.initialize()
    expect(store.getSnapshot().status).toBe('uninitialized')
  })

  it('setup → unlocked и одноразовый recovery-код в снимке', async () => {
    await store.setup(PASS)
    const snap = store.getSnapshot()
    expect(snap.status).toBe('unlocked')
    expect(snap.pendingRecoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}/)
  })

  it('acknowledgeRecovery очищает код из памяти', async () => {
    await store.setup(PASS)
    store.acknowledgeRecovery()
    expect(store.getSnapshot().pendingRecoveryCode).toBeUndefined()
  })

  it('подписка уведомляется об изменениях', async () => {
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    await store.setup(PASS)
    expect(calls).toBeGreaterThan(0)
  })

  it('lock → locked; повторный store видит locked при initialize', async () => {
    await store.setup(PASS)
    store.lock()
    expect(store.getSnapshot().status).toBe('locked')
    await store.initialize()
    expect(store.getSnapshot().status).toBe('locked')
  })

  it('неверная фраза пробрасывает ошибку, статус остаётся locked', async () => {
    await store.setup(PASS)
    store.lock()
    await expect(store.unlockWithPassphrase('wrong-but-long')).rejects.toThrow()
    expect(store.getSnapshot().status).toBe('locked')
  })

  it('pinAvailable отражает включение PIN', async () => {
    await store.setup(PASS)
    expect(store.getSnapshot().pinAvailable).toBe(false)
    await store.enablePin('123456')
    expect(store.getSnapshot().pinAvailable).toBe(true)
  })
  it('regenerateRecoveryCode выставляет новый одноразовый код', async () => {
    await store.setup(PASS)
    store.acknowledgeRecovery()
    expect(store.getSnapshot().pendingRecoveryCode).toBeUndefined()
    await store.regenerateRecoveryCode()
    expect(store.getSnapshot().pendingRecoveryCode).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}/,
    )
  })
})
