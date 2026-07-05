import type { CryptoService } from '@core/crypto/cryptoService.ts'
import type { KeyDerivation } from '@core/crypto/keyDerivation.ts'
import type { Sodium } from '@core/crypto/sodium.ts'
import { createSodiumCryptoService } from '@core/crypto/sodiumCryptoService.ts'
import {
  createSodiumKeyDerivation,
  recommendedKdfParams,
  recommendedPinKdfParams,
} from '@core/crypto/sodiumKeyDerivation.ts'
import { createWorkerKeyDerivation } from '@core/crypto/workerKeyDerivation.ts'
import { loadModules } from '@core/registry/moduleRegistry.ts'
import type { ModuleContract } from '@core/registry/moduleContract.ts'
import { createIdbRepository } from '@core/storage/idbAdapter.ts'
import type { Repository } from '@core/storage/repository.ts'
import { createVaultService } from '@core/vault/vaultService.ts'
import type { VaultService } from '@core/vault/vaultState.ts'

/**
 * Composition root.
 *
 * Единственное место, где конкретные адаптеры подставляются под порты ядра.
 * Подключено: M1 CORE-crypto, M2 CORE-storage, M3 CORE-vault. Дальше:
 *   - registry:   ModuleRegistry   (M4)
 *   - transport:  TransportTarget  (M7, file-адаптер)
 */

export interface AppContainer {
  /** Инициализированный экземпляр libsodium (готов после `loadSodium()`). */
  readonly sodium: Sodium
  /** Симметричная крипта (XChaCha20-Poly1305). */
  readonly crypto: CryptoService
  /** Вывод ключей (Argon2id) и генерация recovery-кода. */
  readonly keyDerivation: KeyDerivation
  /** Персистентность зашифрованных данных и VaultMeta (IndexedDB). */
  readonly repository: Repository
  /** Жизненный цикл секрета и иерархия ключей. */
  readonly vault: VaultService
  /** Модули-фичи, собранные реестром из контрактов (build-time). */
  readonly modules: ModuleContract[]
}

export interface ContainerDeps {
  readonly sodium: Sodium
}

export function createContainer(deps: ContainerDeps): AppContainer {
  const crypto = createSodiumCryptoService(deps.sodium)
  // В браузере Argon2id уходит в Web Worker (UI не блокируется); в Node/без
  // Worker используется прямой синхронный адаптер.
  const keyDerivation =
    typeof Worker === 'undefined'
      ? createSodiumKeyDerivation(deps.sodium)
      : createWorkerKeyDerivation(deps.sodium)
  const repository = createIdbRepository()
  const vault = createVaultService({
    crypto,
    keyDerivation,
    repo: repository,
    kdf: recommendedKdfParams(deps.sodium),
    kdfPin: recommendedPinKdfParams(deps.sodium),
  })

  return {
    sodium: deps.sodium,
    crypto,
    keyDerivation,
    repository,
    vault,
    modules: loadModules(),
  }
}
