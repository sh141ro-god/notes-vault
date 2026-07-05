import { useMemo, useState } from 'react'

import { useServices } from '@core/services/ServicesContext.ts'
import { createFileTransport } from '@core/transport/fileTransport.ts'
import { TransportError } from '@core/transport/vaultExportCodec.ts'
import { useVaultStore } from '@core/vault-ui/VaultContext.ts'

import { buildVaultExport, restoreVaultExport } from '../transfer.ts'
import './transfer.css'

function messageOf(error: unknown): string {
  if (error instanceof TransportError) {
    return error.message
  }
  return 'Не удалось выполнить операцию. Попробуйте ещё раз.'
}

export function TransferScreen(): React.JSX.Element {
  const { repository } = useServices()
  const store = useVaultStore()
  const transport = useMemo(() => createFileTransport(), [])
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  async function onExport(): Promise<void> {
    setInfo(undefined)
    setError(undefined)
    setBusy(true)
    try {
      await transport.export(await buildVaultExport(repository))
      setInfo('Файл экспортирован. Храните его в надёжном месте — он защищён вашей кодовой фразой.')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function onImport(): Promise<void> {
    setInfo(undefined)
    setError(undefined)
    const confirmed = window.confirm(
      'Импорт заменит текущие данные данными из файла. Убедитесь, что знаете кодовую фразу от импортируемого файла, иначе доступ к волту будет потерян. Продолжить?',
    )
    if (!confirmed) {
      return
    }
    setBusy(true)
    try {
      const data = await transport.import()
      await restoreVaultExport(repository, data)
      store.lock()
      setInfo('Импорт завершён. Разблокируйте волт кодовой фразой из импортированного файла.')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="transfer">
      <h1>Экспорт и импорт</h1>
      <p className="transfer__hint">
        Перенос волта между устройствами одним зашифрованным файлом. Файл
        бесполезен без вашей кодовой фразы или ключа восстановления.
      </p>

      <div className="transfer__actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void onExport()
          }}
        >
          Экспортировать в файл
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void onImport()
          }}
        >
          Импортировать из файла
        </button>
      </div>

      <p className="transfer__warn">
        Импорт заменяет текущие заметки данными из файла — это необратимо.
      </p>

      {info !== undefined && <p className="transfer__info">{info}</p>}
      {error !== undefined && (
        <p className="transfer__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
