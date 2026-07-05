import './errorBanner.css'

interface ErrorBannerProps {
  message: string
  onClose?: () => void
}

/** Инлайн-баннер ошибки действия (вместо молчаливого проглатывания reject). */
export function ErrorBanner({ message, onClose }: ErrorBannerProps): React.JSX.Element {
  return (
    <div className="errbanner" role="alert">
      <span className="errbanner__text">{message}</span>
      {onClose && (
        <button
          type="button"
          className="errbanner__close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  )
}
