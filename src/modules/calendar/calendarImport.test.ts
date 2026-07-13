import { describe, expect, it } from 'vitest'

import { parseCalendarPlan } from './calendarImport.ts'

const START = Date.parse('2026-08-01T09:00:00')

describe('parseCalendarPlan', () => {
  it('создаёт календарь и задачи с относительными днями', () => {
    const plan = JSON.stringify({
      calendar: { name: 'Рисование', color: '#e9b8c2', durationDays: 180 },
      tasks: [
        { title: 'Линии', offsetDays: 0, steps: ['Урок', '20 набросков'] },
        { title: 'Перспектива', offsetDays: 3 },
      ],
    })
    const { calendar, tasks } = parseCalendarPlan(plan, START)
    expect(calendar.name).toBe('Рисование')
    expect(calendar.durationDays).toBe(180)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.day).toBe('2026-08-01')
    expect(tasks[0]?.steps).toHaveLength(2)
    expect(tasks[1]?.day).toBe('2026-08-04')
    // все задачи привязаны к созданному календарю
    expect(new Set(tasks.map((t) => t.calendarId))).toEqual(new Set([calendar.id]))
  })

  it('поддерживает абсолютную дату day', () => {
    const plan = JSON.stringify({
      calendar: { name: 'План' },
      tasks: [{ title: 'X', day: '2026-09-15' }],
    })
    const { tasks } = parseCalendarPlan(plan, START)
    expect(tasks[0]?.day).toBe('2026-09-15')
  })

  it('без offsetDays/day задача без дня (бэклог)', () => {
    const { tasks } = parseCalendarPlan(
      JSON.stringify({ calendar: { name: 'П' }, tasks: [{ title: 'Y' }] }),
      START,
    )
    expect(tasks[0]?.day).toBeUndefined()
  })

  it('некорректный JSON и битый формат бросают', () => {
    expect(() => parseCalendarPlan('{не json', START)).toThrow()
    expect(() => parseCalendarPlan(JSON.stringify({ foo: 1 }), START)).toThrow()
  })

  it('невалидная абсолютная дата игнорируется (день не ставится)', () => {
    const { tasks } = parseCalendarPlan(
      JSON.stringify({ calendar: { name: 'П' }, tasks: [{ title: 'Z', day: '2026-13-40' }] }),
      START,
    )
    expect(tasks[0]?.day).toBeUndefined()
  })
})
