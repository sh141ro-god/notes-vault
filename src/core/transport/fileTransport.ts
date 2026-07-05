import type { TransportTarget, VaultExport } from './transportTarget.ts'
import {
  decodeVaultExport,
  encodeVaultExport,
  TransportError,
} from './vaultExportCodec.ts'

/**
 * Файловый адаптер TransportTarget: экспорт = скачивание одного JSON-файла,
 * импорт = выбор файла и его разбор. Браузерные File API; кодек/валидация
 * вынесены в vaultExportCodec (тестируются отдельно).
 */
export function createFileTransport(): TransportTarget {
  return {
    id: 'file',

    export(data: VaultExport): Promise<void> {
      const text = encodeVaultExport(data)
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `notes-vault-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      return Promise.resolve()
    },

    import(): Promise<VaultExport> {
      return new Promise<VaultExport>((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json,.json'
        let settled = false
        // UI-01: отмена диалога выбора файла (крестик/Esc) не шлёт `change` —
        // без этого промис висел бы вечно и блокировал экран переноса. Событие
        // `cancel` современных браузеров закрывает эту дыру.
        input.addEventListener('cancel', () => {
          if (!settled) {
            settled = true
            reject(new TransportError('Импорт отменён'))
          }
        })
        input.addEventListener('change', () => {
          if (settled) {
            return
          }
          settled = true
          const file = input.files?.[0]
          if (!file) {
            reject(new TransportError('Файл не выбран'))
            return
          }
          const reader = new FileReader()
          reader.addEventListener('load', () => {
            const text = reader.result
            if (typeof text !== 'string') {
              reject(new TransportError('Не удалось прочитать файл как текст'))
              return
            }
            try {
              resolve(decodeVaultExport(text))
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          })
          reader.addEventListener('error', () => {
            reject(new TransportError('Не удалось прочитать файл'))
          })
          reader.readAsText(file)
        })
        input.click()
      })
    },
  }
}
