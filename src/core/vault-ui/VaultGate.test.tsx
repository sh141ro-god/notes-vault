// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import { createVaultService } from '@core/vault/vaultService.ts'

import { SyncProvider } from '@core/sync/SyncContext.ts'
import type { SyncController } from '@core/sync/syncController.ts'

import { VaultStoreProvider } from './VaultContext.ts'
import { VaultGate } from './VaultGate.tsx'
import { createVaultStore, type VaultStore } from './vaultStore.ts'

const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }
const PASS = 'correct horse battery staple'

let crypto: CryptoService
let counter = 0

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

afterEach(() => {
  cleanup()
})

async function buildVault(dbName: string): Promise<{
  store: VaultStore
  setupDirect: (passphrase: string) => Promise<void>
}> {
  const sodium = await loadSodium()
  const repository = createIdbRepository(dbName)
  const vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo: repository,
    kdf: TEST_KDF,
    pinMaxFailures: 3,
  })
  return {
    store: createVaultStore({ vault, repository }),
    setupDirect: async (passphrase) => {
      await vault.setup(passphrase)
      vault.lock()
    },
  }
}

const fakeSync: SyncController = {
  getState: () => ({
    status: 'off',
    code: undefined,
    lastSyncAt: undefined,
    error: undefined,
  }),
  subscribe: () => () => undefined,
  enable: () => Promise.resolve('TEST-CODE'),
  enableWithCode: () => Promise.resolve(),
  resume: () => Promise.resolve(),
  bootstrapWithCode: () => Promise.resolve(),
  finishJoin: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
  disable: () => Promise.resolve(),
}

function renderGate(store: VaultStore): void {
  render(
    <SyncProvider value={fakeSync}>
      <VaultStoreProvider value={store}>
        <VaultGate>
          <div>APP_CONTENT</div>
        </VaultGate>
      </VaultStoreProvider>
    </SyncProvider>,
  )
}

describe('VaultGate (DoD)', () => {
  it('первый запуск ведёт на создание волта', async () => {
    counter += 1
    const { store } = await buildVault(`gate-${String(counter)}`)
    renderGate(store)
    expect(await screen.findByText('Создание волта')).toBeTruthy()
    expect(screen.queryByText('APP_CONTENT')).toBeNull()
  })

  it('существующий волт ведёт на разблокировку', async () => {
    counter += 1
    const name = `gate-${String(counter)}`
    const first = await buildVault(name)
    await first.setupDirect(PASS)
    const second = await buildVault(name)
    renderGate(second.store)
    expect(await screen.findByText('Разблокировка')).toBeTruthy()
    expect(screen.queryByText('APP_CONTENT')).toBeNull()
  })

  it('setup → recovery-код показывается один раз → подтверждение открывает приложение', async () => {
    counter += 1
    const user = userEvent.setup()
    const { store } = await buildVault(`gate-${String(counter)}`)
    renderGate(store)

    await screen.findByText('Создание волта')
    await user.type(screen.getByLabelText('Кодовая фраза'), PASS)
    await user.type(screen.getByLabelText('Повторите фразу'), PASS)
    await user.click(screen.getByRole('button', { name: 'Создать волт' }))

    // одноразовый показ ключа восстановления
    expect(await screen.findByText('Ключ восстановления')).toBeTruthy()
    expect(screen.queryByText('APP_CONTENT')).toBeNull()

    // подтверждаем сохранение и продолжаем
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByText('APP_CONTENT')).toBeTruthy()
  })

  it('слабая фраза не создаёт волт (валидация UI)', async () => {
    counter += 1
    const user = userEvent.setup()
    const { store } = await buildVault(`gate-${String(counter)}`)
    renderGate(store)

    await screen.findByText('Создание волта')
    await user.type(screen.getByLabelText('Кодовая фраза'), 'short')
    await user.type(screen.getByLabelText('Повторите фразу'), 'short')
    await user.click(screen.getByRole('button', { name: 'Создать волт' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Ключ восстановления')).toBeNull()
  })

  it('неверная фраза при разблокировке показывает ошибку', async () => {
    counter += 1
    const user = userEvent.setup()
    const name = `gate-${String(counter)}`
    const first = await buildVault(name)
    await first.setupDirect(PASS)
    const second = await buildVault(name)
    renderGate(second.store)

    await screen.findByText('Разблокировка')
    await user.type(screen.getByLabelText('Кодовая фраза'), 'wrong-but-long-enough')
    await user.click(screen.getByRole('button', { name: 'Разблокировать' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('APP_CONTENT')).toBeNull()
  })
})
