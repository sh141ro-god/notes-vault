/**
 * Авто-лок: запирает волт при бездействии и при сворачивании вкладки.
 *
 * Источники событий (DOM) подключаются только в браузере; таймер бездействия
 * работает везде, поэтому логику можно тестировать в Node с фейковыми таймерами.
 */
export interface LockController {
  start(): void
  stop(): void
  /** Сбросить таймер бездействия (вызывается активностью пользователя). */
  notifyActivity(): void
}

export interface LockControllerDeps {
  onLock: () => void
  idleTimeoutMs: number
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

export function createLockController(deps: LockControllerDeps): LockController {
  const { onLock, idleTimeoutMs } = deps
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = false

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function armTimer(): void {
    clearTimer()
    timer = setTimeout(() => {
      onLock()
    }, idleTimeoutMs)
  }

  function handleActivity(): void {
    if (active) {
      armTimer()
    }
  }

  function handleVisibility(): void {
    if (typeof document !== 'undefined' && document.hidden) {
      onLock()
    }
  }

  return {
    start(): void {
      if (active) {
        return
      }
      active = true
      armTimer()
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibility)
      }
      if (typeof window !== 'undefined') {
        for (const eventName of ACTIVITY_EVENTS) {
          window.addEventListener(eventName, handleActivity, { passive: true })
        }
      }
    },

    stop(): void {
      active = false
      clearTimer()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
      if (typeof window !== 'undefined') {
        for (const eventName of ACTIVITY_EVENTS) {
          window.removeEventListener(eventName, handleActivity)
        }
      }
    },

    notifyActivity(): void {
      handleActivity()
    },
  }
}
