import { deriveWrapKeyWith } from './kdfCompute.ts'
import type { KdfParams } from './keyDerivation.ts'
import { loadSodium } from './sodium.ts'

interface DeriveRequest {
  id: number
  secret: string
  salt: Uint8Array
  kdf: KdfParams
}

interface DeriveResponse {
  id: number
  key?: Uint8Array
  error?: string
}

// Минимальная типизация глобала воркера без подключения webworker-lib
// (избегаем конфликта с DOM-lib приложения).
const ctx = self as unknown as {
  postMessage(message: DeriveResponse): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<DeriveRequest>) => void,
  ): void
}

ctx.addEventListener('message', (event) => {
  const { id, secret, salt, kdf } = event.data
  void (async () => {
    try {
      const sodium = await loadSodium()
      const key = deriveWrapKeyWith(sodium, secret, salt, kdf)
      ctx.postMessage({ id, key })
    } catch (error) {
      ctx.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()
})
