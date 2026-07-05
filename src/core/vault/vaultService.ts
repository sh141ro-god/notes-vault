import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KdfParams, KeyDerivation } from '@core/crypto/keyDerivation.ts'
import { ARGON2ID_SALT_BYTES } from '@core/crypto/keyDerivation.ts'
import type { Repository } from '@core/storage/repository.ts'
import type { VaultMeta } from '@core/storage/schemas.ts'

import { assertPassphrase, assertPin } from './secretPolicy.ts'
import { VaultError } from './vaultError.ts'
import type { VaultService, VaultStatus } from './vaultState.ts'

/** Порог неудачных попыток PIN, после которого PIN-обёртка стирается. */
const DEFAULT_PIN_MAX_FAILURES = 5

export interface VaultServiceDeps {
  readonly crypto: CryptoService
  readonly keyDerivation: KeyDerivation
  readonly repo: Repository
  /** Параметры Argon2id для новых обёрток (из composition root). */
  readonly kdf: KdfParams
  /**
   * Параметры Argon2id для PIN-обёртки (SEC-01) — обычно дороже `kdf`, т.к. PIN
   * низкоэнтропийный. Если не задано, используется общий `kdf`.
   */
  readonly kdfPin?: KdfParams
  readonly pinMaxFailures?: number
}

/**
 * Сердце безопасности: жизненный цикл секрета и иерархия ключей.
 *
 * Случайный DEK шифрует данные; сам DEK хранится завёрнутым под фразу, ключ
 * восстановления и (опционально) PIN — каждый через свой Argon2id-ключ. DEK
 * живёт ТОЛЬКО в замыкании этого сервиса и обнуляется при lock(). Промежуточные
 * wrap-ключи затираются сразу после использования. Все асинхронные операции
 * сериализованы (мьютекс), чтобы read-modify-write (например, счётчик неудач
 * PIN) был атомарным.
 */
export function createVaultService(deps: VaultServiceDeps): VaultService {
  const { crypto, keyDerivation, repo, kdf } = deps
  const kdfPin = deps.kdfPin ?? kdf
  const pinMaxFailures = deps.pinMaxFailures ?? DEFAULT_PIN_MAX_FAILURES

  let status: VaultStatus = 'uninitialized'
  let dek: Uint8Array | undefined
  let hasVault = false

  // Простой мьютекс: операции выполняются строго последовательно.
  let mutex: Promise<unknown> = Promise.resolve()
  function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutex.then(operation, operation)
    mutex = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  function adoptDek(next: Uint8Array): void {
    if (dek) {
      crypto.wipe(dek)
    }
    dek = next
    status = 'unlocked'
  }

  async function loadMeta(): Promise<VaultMeta> {
    const meta = await repo.readVaultMeta()
    if (!meta) {
      throw new VaultError('NO_VAULT', 'Волт не инициализирован')
    }
    hasVault = true
    return meta
  }

  async function resetPinFailures(meta: VaultMeta): Promise<void> {
    if (meta.pinFailures !== 0) {
      await repo.writeVaultMeta({ ...meta, pinFailures: 0 })
    }
  }

  return {
    status(): VaultStatus {
      return status
    },

    initialize(): Promise<VaultStatus> {
      return runExclusive(async () => {
        const meta = await repo.readVaultMeta()
        hasVault = meta !== undefined
        status = hasVault ? 'locked' : 'uninitialized'
        return status
      })
    },

    setup(passphrase: string): Promise<{ recoveryCode: string }> {
      return runExclusive(async () => {
        assertPassphrase(passphrase)
        if (await repo.readVaultMeta()) {
          throw new VaultError('ALREADY_INITIALIZED', 'Волт уже создан')
        }
        const newDek = crypto.randomKey()
        const saltPass = crypto.randomBytes(ARGON2ID_SALT_BYTES)
        const saltRec = crypto.randomBytes(ARGON2ID_SALT_BYTES)
        const recoveryCode = keyDerivation.generateRecoveryCode()

        const wrapPass = await keyDerivation.deriveWrapKey(passphrase, saltPass, kdf)
        const wrapRec = await keyDerivation.deriveWrapKey(recoveryCode, saltRec, kdf)

        const meta: VaultMeta = {
          v: 1,
          kdf,
          salts: { pass: saltPass, rec: saltRec },
          wrappedDek: {
            pass: crypto.encrypt(wrapPass, newDek),
            rec: crypto.encrypt(wrapRec, newDek),
          },
          pinFailures: 0,
          createdAt: Date.now(),
        }
        crypto.wipe(wrapPass)
        crypto.wipe(wrapRec)

        await repo.writeVaultMeta(meta)
        hasVault = true
        adoptDek(newDek)
        return { recoveryCode }
      })
    },

    unlockWithPassphrase(passphrase: string): Promise<void> {
      return runExclusive(async () => {
        const meta = await loadMeta()
        const wrap = await keyDerivation.deriveWrapKey(
          passphrase,
          meta.salts.pass,
          meta.kdf,
        )
        let next: Uint8Array
        try {
          next = crypto.decrypt(wrap, meta.wrappedDek.pass)
        } catch {
          crypto.wipe(wrap)
          throw new VaultError('WRONG_SECRET', 'Неверная кодовая фраза')
        }
        crypto.wipe(wrap)
        await resetPinFailures(meta)
        adoptDek(next)
      })
    },

    unlockWithRecovery(code: string): Promise<void> {
      return runExclusive(async () => {
        const meta = await loadMeta()
        const wrap = await keyDerivation.deriveWrapKey(
          code,
          meta.salts.rec,
          meta.kdf,
        )
        let next: Uint8Array
        try {
          next = crypto.decrypt(wrap, meta.wrappedDek.rec)
        } catch {
          crypto.wipe(wrap)
          throw new VaultError('WRONG_SECRET', 'Неверный ключ восстановления')
        }
        crypto.wipe(wrap)
        await resetPinFailures(meta)
        adoptDek(next)
      })
    },

    unlockWithPin(pin: string): Promise<void> {
      return runExclusive(async () => {
        const meta = await loadMeta()
        const pinWrap = meta.wrappedDek.pin
        const pinSalt = meta.salts.pin
        if (!pinWrap || !pinSalt) {
          throw new VaultError('PIN_NOT_SET', 'PIN не настроен')
        }
        // Обёртка PIN выведена своими параметрами (SEC-01); старые волты без
        // `kdfPin` совместимо используют общий `kdf`.
        const wrap = await keyDerivation.deriveWrapKey(
          pin,
          pinSalt,
          meta.kdfPin ?? meta.kdf,
        )
        let next: Uint8Array
        try {
          next = crypto.decrypt(wrap, pinWrap)
        } catch {
          crypto.wipe(wrap)
          const failures = meta.pinFailures + 1
          if (failures >= pinMaxFailures) {
            const updated: VaultMeta = {
              v: meta.v,
              kdf: meta.kdf,
              salts: { pass: meta.salts.pass, rec: meta.salts.rec },
              wrappedDek: { pass: meta.wrappedDek.pass, rec: meta.wrappedDek.rec },
              pinFailures: 0,
              createdAt: meta.createdAt,
            }
            await repo.writeVaultMeta(updated)
            status = 'recoveryOnly'
            throw new VaultError(
              'PIN_LOCKED_OUT',
              'Слишком много неудач PIN — он отключён; используйте фразу или ключ восстановления',
            )
          }
          await repo.writeVaultMeta({ ...meta, pinFailures: failures })
          throw new VaultError('WRONG_SECRET', 'Неверный PIN')
        }
        crypto.wipe(wrap)
        await resetPinFailures(meta)
        adoptDek(next)
      })
    },

    enablePin(pin: string): Promise<void> {
      return runExclusive(async () => {
        assertPin(pin)
        if (status !== 'unlocked' || !dek) {
          throw new VaultError('LOCKED', 'Волт заблокирован')
        }
        const meta = await loadMeta()
        const saltPin = crypto.randomBytes(ARGON2ID_SALT_BYTES)
        const wrap = await keyDerivation.deriveWrapKey(pin, saltPin, kdfPin)
        const wrappedPin = crypto.encrypt(wrap, dek)
        crypto.wipe(wrap)
        const updated: VaultMeta = {
          ...meta,
          kdfPin,
          salts: { ...meta.salts, pin: saltPin },
          wrappedDek: { ...meta.wrappedDek, pin: wrappedPin },
          pinFailures: 0,
        }
        await repo.writeVaultMeta(updated)
      })
    },

    changePassphrase(
      oldPassphrase: string,
      newPassphrase: string,
    ): Promise<void> {
      return runExclusive(async () => {
        assertPassphrase(newPassphrase)
        const meta = await loadMeta()
        const oldWrap = await keyDerivation.deriveWrapKey(
          oldPassphrase,
          meta.salts.pass,
          meta.kdf,
        )
        let currentDek: Uint8Array
        try {
          currentDek = crypto.decrypt(oldWrap, meta.wrappedDek.pass)
        } catch {
          crypto.wipe(oldWrap)
          throw new VaultError('WRONG_SECRET', 'Неверная текущая фраза')
        }
        crypto.wipe(oldWrap)

        const newSalt = crypto.randomBytes(ARGON2ID_SALT_BYTES)
        const newWrap = await keyDerivation.deriveWrapKey(
          newPassphrase,
          newSalt,
          meta.kdf,
        )
        const newWrappedPass = crypto.encrypt(newWrap, currentDek)
        crypto.wipe(newWrap)

        // Перешифровывается ТОЛЬКО обёртка под фразой; rec/pin и блобы не трогаем.
        const updated: VaultMeta = {
          ...meta,
          salts: { ...meta.salts, pass: newSalt },
          wrappedDek: { ...meta.wrappedDek, pass: newWrappedPass },
        }
        await repo.writeVaultMeta(updated)
        adoptDek(currentDek)
      })
    },

    changeRecoveryCode(): Promise<{ recoveryCode: string }> {
      return runExclusive(async () => {
        if (status !== 'unlocked' || !dek) {
          throw new VaultError('LOCKED', 'Волт заблокирован')
        }
        const meta = await loadMeta()
        const recoveryCode = keyDerivation.generateRecoveryCode()
        const saltRec = crypto.randomBytes(ARGON2ID_SALT_BYTES)
        const wrap = await keyDerivation.deriveWrapKey(
          recoveryCode,
          saltRec,
          meta.kdf,
        )
        const wrappedRec = crypto.encrypt(wrap, dek)
        crypto.wipe(wrap)
        // Меняем ТОЛЬКО rec-обёртку; pass/pin и блобы не трогаем.
        const updated: VaultMeta = {
          ...meta,
          salts: { ...meta.salts, rec: saltRec },
          wrappedDek: { ...meta.wrappedDek, rec: wrappedRec },
        }
        await repo.writeVaultMeta(updated)
        return { recoveryCode }
      })
    },

    lock(): void {
      if (dek) {
        crypto.wipe(dek)
        dek = undefined
      }
      status = hasVault ? 'locked' : 'uninitialized'
    },

    requireKey(): Uint8Array {
      if (status !== 'unlocked' || !dek) {
        throw new VaultError('LOCKED', 'Волт заблокирован')
      }
      return dek
    },
  }
}
