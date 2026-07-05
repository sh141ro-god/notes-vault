import { describe, expect, it } from 'vitest'

import {
  canToggleStep,
  createStep,
  createTask,
  indexStatus,
  isTaskDone,
  type Task,
  taskProgress,
  TaskSchema,
  taskStatus,
  toggleStep,
} from './model.ts'

const NOW = new Date(2026, 5, 23, 12, 0).getTime() // 23 июня 2026, локально

function chain(...titles: string[]): Task {
  return { ...createTask('Цепочка'), steps: titles.map((t) => createStep(t)) }
}

describe('модель задач', () => {
  it('одиночная цель: done управляет готовностью и прогрессом', () => {
    const t = createTask('Одиночная')
    expect(isTaskDone(t)).toBe(false)
    expect(taskProgress(t)).toEqual({ done: 0, total: 1 })
    const done = { ...t, done: true }
    expect(isTaskDone(done)).toBe(true)
    expect(taskProgress(done)).toEqual({ done: 1, total: 1 })
  })

  it('цепочка: готовность только когда все шаги done', () => {
    let t = chain('a', 'b')
    expect(isTaskDone(t)).toBe(false)
    t = toggleStep(t, t.steps[0]!.id)
    t = toggleStep(t, t.steps[1]!.id)
    expect(isTaskDone(t)).toBe(true)
    expect(taskProgress(t)).toEqual({ done: 2, total: 2 })
  })

  it('жёсткая зависимость: нельзя закрыть шаг 2 раньше шага 1', () => {
    const t = chain('a', 'b')
    expect(canToggleStep(t, 1)).toBe(false)
    const unchanged = toggleStep(t, t.steps[1]!.id)
    expect(unchanged.steps[1]!.done).toBe(false) // отказ: порядок нарушать нельзя
    const afterFirst = toggleStep(t, t.steps[0]!.id)
    expect(canToggleStep(afterFirst, 1)).toBe(true)
  })

  it('снятие шага сбрасывает последующие', () => {
    let t = chain('a', 'b', 'c')
    t = toggleStep(t, t.steps[0]!.id)
    t = toggleStep(t, t.steps[1]!.id)
    t = toggleStep(t, t.steps[0]!.id) // снимаем первый
    expect(t.steps.map((s) => s.done)).toEqual([false, false, false])
  })

  it('статус провала выводится по часам устройства', () => {
    const past = { ...createTask('Просрочена'), day: '2026-06-22' }
    const today = { ...createTask('Сегодня'), day: '2026-06-23' }
    const noDay = createTask('Без срока')
    expect(taskStatus(past, NOW)).toBe('failed')
    expect(taskStatus(today, NOW)).toBe('pending')
    expect(taskStatus(noDay, NOW)).toBe('pending')
    expect(taskStatus({ ...past, done: true }, NOW)).toBe('done') // выполненная не провалена
  })

  it('indexStatus согласован с taskStatus (по полям индекса)', () => {
    expect(
      indexStatus({ progress: { done: 0, total: 2 }, day: '2026-06-22' }, NOW),
    ).toBe('failed')
    expect(
      indexStatus({ progress: { done: 2, total: 2 }, day: '2026-06-22' }, NOW),
    ).toBe('done')
    expect(indexStatus({ progress: { done: 1, total: 2 } }, NOW)).toBe('pending')
  })

  it('миграция v1 → v2: добавляет steps/tagIds, сохраняет done', () => {
    const v1 = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Старая',
      done: true,
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: 1,
    }
    const t = TaskSchema.parse(v1)
    expect(t.schemaVersion).toBe(2)
    expect(t.steps).toEqual([])
    expect(t.tagIds).toEqual([])
    expect(t.done).toBe(true)
  })
})
