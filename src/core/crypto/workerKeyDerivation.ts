import { generateRecoveryCodeWith } from './kdfCompute.ts'
import type { KdfParams, KeyDerivation } from './keyDerivation.ts'
import type { Sodium } from './sodium.ts'

interface DeriveResponse {
  id: number
  key?: Uint8Array
  error?: string
}

interface Pending {
  resolve: (key: Uint8Array) => void
  reject: (error: Error) => void
}

/**
 * Адаптер KeyDerivation, выносящий Argon2id в Web Worker — UI не замораживается
 * при setup/unlock даже на высоких параметрах KDF. Генерация recovery-кода
 * (быстрый CSPRNG) остаётся на главном потоке.
 *
 * Используется в браузере (DI выбирает его при наличии Worker). Тесты и Node
 * берут прямой createSodiumKeyDerivation. Транспорт воркера проверяется в
 * браузере (M5), логика вывода ключа покрыта тестами kdfCompute через прямой
 * адаптер.
 */
export function createWorkerKeyDerivation(sodium: Sodium): KeyDerivation {
  let worker: Worker | undefined
  let nextId = 0
  const pending = new Map<number, Pending>()

  /**
   * KDF-01: сбой воркера (не загрузился, упал, `messageerror`) раньше подвешивал
   * разблокировку навсегда — deriveWrapKey возвращал промис, который не завершался.
   * Теперь любой сбой отклоняет ВСЕ ожидающие вызовы и сбрасывает воркер, чтобы
   * следующая попытка создала его заново (или сработал фолбэк на уровне DI).
   */
  function failAllPending(message: string): void {
    for (const entry of pending.values()) {
      entry.reject(new Error(message))
    }
    pending.clear()
    worker = undefined
  }

  function getWorker(): Worker {
    if (!worker) {
      const created = new Worker(new URL('./kdf.worker.ts', import.meta.url), {
        type: 'module',
      })
      created.addEventListener(
        'message',
        (event: MessageEvent<DeriveResponse>) => {
          const { id, key, error } = event.data
          const entry = pending.get(id)
          if (!entry) {
            return
          }
          pending.delete(id)
          if (key !== undefined) {
            entry.resolve(key)
          } else {
            entry.reject(new Error(error ?? 'Ошибка воркера KDF'))
          }
        },
      )
      created.addEventListener('error', () => {
        failAllPending('Сбой воркера вывода ключа. Повторите попытку.')
      })
      created.addEventListener('messageerror', () => {
        failAllPending('Повреждённое сообщение от воркера вывода ключа.')
      })
      worker = created
    }
    return worker
  }

  return {
    deriveWrapKey(
      secret: string,
      salt: Uint8Array,
      kdf: KdfParams,
    ): Promise<Uint8Array> {
      const activeWorker = getWorker()
      const id = nextId
      nextId += 1
      return new Promise<Uint8Array>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        activeWorker.postMessage({ id, secret, salt, kdf })
      })
    },
    generateRecoveryCode(): string {
      return generateRecoveryCodeWith(sodium)
    },
  }
}
