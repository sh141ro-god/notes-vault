import { describe, expect, it } from 'vitest'

import {
  dayKey,
  endOfDayMs,
  isDayBeforeToday,
  isDayKey,
  isToday,
  startOfDayMs,
  todayKey,
} from './dayKey.ts'

describe('dayKey', () => {
  it('форматирует локальный день как YYYY-MM-DD с ведущими нулями', () => {
    const ts = new Date(2026, 0, 5, 13, 30).getTime() // 5 янв 2026, локально
    expect(dayKey(ts)).toBe('2026-01-05')
  })

  it('isDayKey принимает корректную и отвергает некорректную форму', () => {
    expect(isDayKey('2026-06-23')).toBe(true)
    expect(isDayKey('23.06.2026')).toBe(false)
    expect(isDayKey('2026-6-3')).toBe(false)
  })

  it('startOfDayMs и endOfDayMs ограничивают локальные сутки', () => {
    const key = '2026-06-23'
    const start = startOfDayMs(key)
    const end = endOfDayMs(key)
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(end).getHours()).toBe(23)
    expect(end - start).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('isDayBeforetoday: прошлый день — true, сегодня и будущее — false', () => {
    const now = new Date(2026, 5, 23, 12, 0).getTime()
    expect(isDayBeforeToday('2026-06-22', now)).toBe(true)
    expect(isDayBeforeToday('2026-06-23', now)).toBe(false)
    expect(isDayBeforeToday('2026-06-24', now)).toBe(false)
  })

  it('isToday/todayKey согласованы с now', () => {
    const now = new Date(2026, 5, 23, 9, 0).getTime()
    expect(todayKey(now)).toBe('2026-06-23')
    expect(isToday('2026-06-23', now)).toBe(true)
    expect(isToday('2026-06-24', now)).toBe(false)
  })

  it('endOfDayMs бросает на некорректном ключе', () => {
    expect(() => endOfDayMs('nope')).toThrow()
  })
})
