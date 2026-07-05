import {
  deriveWrapKeyWith,
  generateRecoveryCodeWith,
} from './kdfCompute.ts'
import type { KdfParams, KeyDerivation } from './keyDerivation.ts'
import type { Sodium } from './sodium.ts'

/**
 * Рекомендованные параметры Argon2id для мастер-секрета. INTERACTIVE —
 * безопасный базовый уровень, не выедающий память на слабых мобильных
 * браузерах; точную политику настраивает composition root.
 */
export function recommendedKdfParams(sodium: Sodium): KdfParams {
  return {
    alg: 'argon2id',
    opslimit: sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    memlimit: sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
  }
}

/**
 * Параметры KDF для PIN-обёртки (SEC-01). PIN низкоэнтропийный и может утечь
 * вместе с дампом IndexedDB или файлом экспорта, поэтому его обёртка выводится
 * с MODERATE-параметрами (заметно дороже INTERACTIVE). PIN вводится редко, так
 * что дополнительная задержка при вводе приемлема, а офлайн-перебор дорожает
 * на порядок.
 */
export function recommendedPinKdfParams(sodium: Sodium): KdfParams {
  return {
    alg: 'argon2id',
    opslimit: sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    memlimit: sodium.crypto_pwhash_MEMLIMIT_MODERATE,
  }
}

/**
 * Прямой адаптер KeyDerivation: вычисляет Argon2id синхронно и оборачивает в
 * Promise. Блокирует поток — в браузере используйте createWorkerKeyDerivation;
 * этот вариант для тестов, Node и фолбэка без Worker.
 */
export function createSodiumKeyDerivation(sodium: Sodium): KeyDerivation {
  return {
    deriveWrapKey(
      secret: string,
      salt: Uint8Array,
      kdf: KdfParams,
    ): Promise<Uint8Array> {
      // Синхронное вычисление → переводим возможный throw в reject,
      // чтобы контракт был чисто промисным.
      try {
        return Promise.resolve(deriveWrapKeyWith(sodium, secret, salt, kdf))
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    },
    generateRecoveryCode(): string {
      return generateRecoveryCodeWith(sodium)
    },
  }
}
