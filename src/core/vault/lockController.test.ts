import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLockController } from './lockController.ts'

describe('lockController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('запирает по таймауту бездействия', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const lc = createLockController({ onLock, idleTimeoutMs: 1000 })
    lc.start()
    vi.advanceTimersByTime(999)
    expect(onLock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLock).toHaveBeenCalledTimes(1)
    lc.stop()
  })

  it('активность сбрасывает таймер бездействия', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const lc = createLockController({ onLock, idleTimeoutMs: 1000 })
    lc.start()
    vi.advanceTimersByTime(800)
    lc.notifyActivity()
    vi.advanceTimersByTime(800)
    expect(onLock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onLock).toHaveBeenCalledTimes(1)
    lc.stop()
  })

  it('stop отменяет авто-лок', () => {
    vi.useFakeTimers()
    const onLock = vi.fn()
    const lc = createLockController({ onLock, idleTimeoutMs: 1000 })
    lc.start()
    lc.stop()
    vi.advanceTimersByTime(5000)
    expect(onLock).not.toHaveBeenCalled()
  })
})
