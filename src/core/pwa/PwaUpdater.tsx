import { useRegisterSW } from 'virtual:pwa-register/react'

import './pwa.css'

/**
 * Ненавязчивый баннер жизненного цикла service worker: сообщает о готовности к
 * офлайну и предлагает обновиться, когда доступна новая версия (registerType:
 * 'prompt' — обновление только по согласию пользователя). Без инлайн-стилей,
 * совместимо со строгим CSP.
 */
export function PwaUpdater(): React.JSX.Element | null {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) {
    return null
  }

  function dismiss(): void {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <span>Доступна новая версия приложения.</span>
          <button
            type="button"
            className="pwa-toast__action"
            onClick={() => {
              void updateServiceWorker(true)
            }}
          >
            Обновить
          </button>
        </>
      ) : (
        <span>Приложение готово к работе офлайн.</span>
      )}
      <button
        type="button"
        aria-label="Закрыть уведомление"
        className="pwa-toast__close"
        onClick={dismiss}
      >
        ✕
      </button>
    </div>
  )
}
