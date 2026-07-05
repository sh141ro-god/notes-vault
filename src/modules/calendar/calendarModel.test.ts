import { describe, expect, it } from 'vitest'

import type { ManifestEntry } from '@core/storage/manifest.ts'

import {
  aggregateByDay,
  dayRatioColor,
  lerpColor,
  monthGrid,
} from './calendarModel.ts'

const entry = (day: string, done: number, total: number): ManifestEntry => ({
  id: '11111111-1111-4111-8111-111111111111',
  updatedAt: 0,
  day,
  progress: { done, total },
})

describe('модель календаря', () => {
  it('monthGrid: 42 ячейки, понедельник-первый; июнь 2026 начинается с 1-го', () => {
    const cells = monthGrid(2026, 5) // июнь (0-индекс)
    expect(cells).toHaveLength(42)
    expect(cells[0]?.key).toBe('2026-06-01')
    expect(cells[0]?.inMonth).toBe(true)
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30)
  })

  it('aggregateByDay: считает всего и выполнено, пропускает без дня', () => {
    const map = aggregateByDay([
      entry('2026-06-23', 2, 2),
      entry('2026-06-23', 0, 3),
      { id: '22222222-2222-4222-8222-222222222222', updatedAt: 0 },
    ])
    expect(map.get('2026-06-23')).toEqual({ total: 2, done: 1 })
  })

  it('lerpColor: концы и середина', () => {
    expect(lerpColor('#ef4444', '#22c55e', 0)).toBe('#ef4444')
    expect(lerpColor('#ef4444', '#22c55e', 1)).toBe('#22c55e')
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('dayRatioColor: нет задач → прозрачный', () => {
    expect(dayRatioColor(0, 0)).toBe('transparent')
    expect(dayRatioColor(1, 1)).toBe('#22c55e')
  })
})
