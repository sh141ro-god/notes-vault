import 'fake-indexeddb/auto'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { loadSodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import { createSodiumKeyDerivation } from '@core/crypto/sodiumKeyDerivation.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'

import { createVaultService } from './vaultService.ts'
import type { VaultService } from './vaultState.ts'

// Облегчённые параметры Argon2id, чтобы тесты были быстрыми (валидно для libsodium).
const TEST_KDF: KdfParams = { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 }
const PASS = 'correct horse battery staple'

let crypto: CryptoService
let dbCounter = 0
let vault: VaultService

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

beforeEach(async () => {
  dbCounter += 1
  const sodium = await loadSodium()
  const repo = createIdbRepository(`vault-test-${String(dbCounter)}`)
  vault = createVaultService({
    crypto,
    keyDerivation: createSodiumKeyDerivation(sodium),
    repo,
    kdf: TEST_KDF,
    pinMaxFailures: 3,
  })
})

const copyKey = (): Uint8Array => Uint8Array.from(vault.requireKey())

describe('VaultService — setup и базовый цикл', () => {
  it('setup создаёт волт, разблокирует и выдаёт recovery-код', async () => {
    const { recoveryCode } = await vault.setup(PASS)
    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){7}$/)
    expect(vault.status()).toBe('unlocked')
    expect(vault.requireKey()).toHaveLength(32)
  })

  it('повторный setup → ALREADY_INITIALIZED', async () => {
    await vault.setup(PASS)
    await expect(vault.setup(PASS)).rejects.toMatchObject({
      code: 'ALREADY_INITIALIZED',
    })
  })

  it('lock обнуляет ключ; requireKey бросает в locked', async () => {
    await vault.setup(PASS)
    vault.lock()
    expect(vault.status()).toBe('locked')
    expect(() => vault.requireKey()).toThrow()
  })

  it('initialize: без волта → uninitialized, с волтом → locked', async () => {
    expect(await vault.initialize()).toBe('uninitialized')
    await vault.setup(PASS)
    expect(await vault.initialize()).toBe('locked')
  })
})

describe('VaultService — разблокировка', () => {
  it('фразой: тот же DEK после lock/unlock', async () => {
    await vault.setup(PASS)
    const before = copyKey()
    vault.lock()
    await vault.unlockWithPassphrase(PASS)
    expect([...vault.requireKey()]).toEqual([...before])
  })

  it('неверная фраза → WRONG_SECRET, остаётся locked', async () => {
    await vault.setup(PASS)
    vault.lock()
    await expect(vault.unlockWithPassphrase('wrong')).rejects.toMatchObject({
      code: 'WRONG_SECRET',
    })
    expect(vault.status()).toBe('locked')
  })

  it('ключом восстановления: тот же DEK', async () => {
    const { recoveryCode } = await vault.setup(PASS)
    const before = copyKey()
    vault.lock()
    await vault.unlockWithRecovery(recoveryCode)
    expect([...vault.requireKey()]).toEqual([...before])
  })

  it('PIN: enablePin → lock → unlockWithPin', async () => {
    await vault.setup(PASS)
    const before = copyKey()
    await vault.enablePin('123456')
    vault.lock()
    await vault.unlockWithPin('123456')
    expect([...vault.requireKey()]).toEqual([...before])
  })

  it('enablePin требует разблокированного волта', async () => {
    await vault.setup(PASS)
    vault.lock()
    await expect(vault.enablePin('123456')).rejects.toMatchObject({ code: 'LOCKED' })
  })
})

describe('VaultService — защита PIN', () => {
  it('после N неудач PIN-обёртка стирается → recoveryOnly; PIN недоступен, фраза работает', async () => {
    await vault.setup(PASS)
    await vault.enablePin('123456')
    vault.lock()

    // 3 неудачи (pinMaxFailures = 3): первые две — WRONG_SECRET, третья — PIN_LOCKED_OUT
    await expect(vault.unlockWithPin('000000')).rejects.toMatchObject({ code: 'WRONG_SECRET' })
    await expect(vault.unlockWithPin('000000')).rejects.toMatchObject({ code: 'WRONG_SECRET' })
    await expect(vault.unlockWithPin('000000')).rejects.toMatchObject({ code: 'PIN_LOCKED_OUT' })
    expect(vault.status()).toBe('recoveryOnly')

    // PIN-обёртка стёрта в персисте
    const repo = createIdbRepository(`vault-test-${String(dbCounter)}`)
    const meta = await repo.readVaultMeta()
    expect(meta?.wrappedDek.pin).toBeUndefined()
    expect(meta?.salts.pin).toBeUndefined()
    await repo.close()

    // дальнейший PIN-вход невозможен, но фраза по-прежнему работает
    await expect(vault.unlockWithPin('123456')).rejects.toMatchObject({ code: 'PIN_NOT_SET' })
    await vault.unlockWithPassphrase(PASS)
    expect(vault.status()).toBe('unlocked')
  })
})

describe('VaultService — changePassphrase', () => {
  it('меняет только обёртку под фразой; DEK и данные сохраняются', async () => {
    await vault.setup(PASS)
    const noteId = '11111111-1111-4111-8111-111111111111'
    const repo = createIdbRepository(`vault-test-${String(dbCounter)}`)

    // зашифруем заметку текущим DEK и сохраним
    const plaintext = new TextEncoder().encode('секрет 🔐')
    await repo.putBlob('notes', noteId, crypto.encrypt(vault.requireKey(), plaintext))

    const metaBefore = await repo.readVaultMeta()
    const recBefore = [...(metaBefore?.wrappedDek.rec.ct ?? [])]

    await vault.changePassphrase(PASS, 'new-pass-phrase')

    const metaAfter = await repo.readVaultMeta()
    // обёртка recovery НЕ изменилась
    expect([...(metaAfter?.wrappedDek.rec.ct ?? [])]).toEqual(recBefore)
    // обёртка под фразой ИЗМЕНИЛАСЬ
    expect([...(metaAfter?.wrappedDek.pass.ct ?? [])]).not.toEqual([
      ...(metaBefore?.wrappedDek.pass.ct ?? []),
    ])

    // старая фраза больше не подходит, новая — да; данные читаются тем же DEK
    vault.lock()
    await expect(vault.unlockWithPassphrase(PASS)).rejects.toMatchObject({
      code: 'WRONG_SECRET',
    })
    await vault.unlockWithPassphrase('new-pass-phrase')
    const blob = await repo.getBlob('notes', noteId)
    expect(blob).toBeDefined()
    const decrypted = crypto.decrypt(vault.requireKey(), blob!)
    expect(new TextDecoder().decode(decrypted)).toBe('секрет 🔐')
    await repo.close()
  })
})

describe('VaultService — DEK не утекает в персист', () => {
  it('VaultMeta не содержит открытого DEK', async () => {
    await vault.setup(PASS)
    const dek = copyKey()
    const repo = createIdbRepository(`vault-test-${String(dbCounter)}`)
    const meta = await repo.readVaultMeta()
    await repo.close()
    // обёртки — это шифртекст (32 байта DEK + 16 байт тега = 48), не сам DEK
    expect(meta?.wrappedDek.pass.ct).toHaveLength(48)
    expect([...(meta?.wrappedDek.pass.ct ?? [])]).not.toEqual([...dek])
    expect([...(meta?.wrappedDek.rec.ct ?? [])]).not.toEqual([...dek])
  })
})

describe('VaultService — валидация секретов (VAULT-01/02)', () => {
  it('отклоняет пустую и слишком короткую фразу', async () => {
    await expect(vault.setup('')).rejects.toMatchObject({ code: 'WEAK_SECRET' })
    await expect(vault.setup('short')).rejects.toMatchObject({
      code: 'WEAK_SECRET',
    })
    expect(vault.status()).toBe('uninitialized')
  })

  it('принимает фразу достаточной длины', async () => {
    await vault.setup('12345678')
    expect(vault.status()).toBe('unlocked')
  })

  it('enablePin отклоняет слишком короткий PIN', async () => {
    await vault.setup(PASS)
    await expect(vault.enablePin('123')).rejects.toMatchObject({
      code: 'WEAK_SECRET',
    })
  })

  it('changePassphrase отклоняет слабую новую фразу', async () => {
    await vault.setup(PASS)
    await expect(vault.changePassphrase(PASS, 'weak')).rejects.toMatchObject({
      code: 'WEAK_SECRET',
    })
  })
})

describe('VaultService — атомарность pinFailures (VAULT-03)', () => {
  it('параллельные неверные попытки PIN не теряют инкременты', async () => {
    await vault.setup(PASS)
    await vault.enablePin('123456')
    vault.lock()

    // pinMaxFailures = 3: две параллельные неверные попытки → счётчик = 2 (не 1)
    await Promise.allSettled([
      vault.unlockWithPin('000000'),
      vault.unlockWithPin('000000'),
    ])

    const repo = createIdbRepository(`vault-test-${String(dbCounter)}`)
    const meta = await repo.readVaultMeta()
    await repo.close()
    expect(meta?.pinFailures).toBe(2)
  })
})

describe('VaultService — changeRecoveryCode (UI-01)', () => {
  it('новый код работает, старый — нет; фраза по-прежнему открывает', async () => {
    const { recoveryCode: oldCode } = await vault.setup(PASS)
    const dekBefore = copyKey()
    const { recoveryCode: newCode } = await vault.changeRecoveryCode()
    expect(newCode).not.toBe(oldCode)

    vault.lock()
    await expect(vault.unlockWithRecovery(oldCode)).rejects.toMatchObject({
      code: 'WRONG_SECRET',
    })
    await vault.unlockWithRecovery(newCode)
    expect([...vault.requireKey()]).toEqual([...dekBefore])

    vault.lock()
    await vault.unlockWithPassphrase(PASS)
    expect(vault.status()).toBe('unlocked')
  })

  it('требует разблокированного волта', async () => {
    await vault.setup(PASS)
    vault.lock()
    await expect(vault.changeRecoveryCode()).rejects.toMatchObject({
      code: 'LOCKED',
    })
  })
})
