import { dayKey, isDayKey } from '@core/time/dayKey.ts'
import { z } from 'zod'

import { createStep, createTask, type Task } from '../tasks/model.ts'
import { type Calendar, createCalendar } from './calendarEntity.ts'

/**
 * Формат файла-плана (импорт календаря-цели). Человекочитаемый JSON:
 *   { version?, calendar: { name, color?, durationDays? }, tasks: [...] }
 * У задачи день задаётся `offsetDays` (от дня импорта, 0 = сегодня) ИЛИ
 * абсолютным `day` (YYYY-MM-DD). Нет ни того, ни другого → задача без дня.
 */
const DAY_MS = 86_400_000
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

const PlanTaskSchema = z.object({
  title: z.string().min(1),
  offsetDays: z.number().int().nonnegative().optional(),
  day: z.string().optional(),
  steps: z.array(z.string()).optional(),
})

const PlanSchema = z.object({
  version: z.literal(1).optional(),
  calendar: z.object({
    name: z.string().min(1).max(64),
    color: z.string().regex(COLOR_RE).optional(),
    durationDays: z.number().int().positive().optional(),
  }),
  tasks: z.array(PlanTaskSchema),
})

export interface ParsedPlan {
  calendar: Calendar
  tasks: Task[]
}

/** Разбирает текст плана в календарь + задачи. Бросает Error на битом формате. */
export function parseCalendarPlan(text: string, startMs = Date.now()): ParsedPlan {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Файл плана — некорректный JSON')
  }
  const parsed = PlanSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('Формат плана не распознан (нужны calendar.name и tasks)')
  }
  const plan = parsed.data

  const base = createCalendar(plan.calendar.name, plan.calendar.color)
  const calendar: Calendar = {
    ...base,
    ...(plan.calendar.durationDays !== undefined
      ? { durationDays: plan.calendar.durationDays }
      : {}),
  }

  const tasks: Task[] = plan.tasks.map((pt) => {
    let day: string | undefined
    if (pt.day !== undefined && isDayKey(pt.day)) {
      day = pt.day
    } else if (pt.offsetDays !== undefined) {
      day = dayKey(startMs + pt.offsetDays * DAY_MS)
    }
    const steps = (pt.steps ?? []).map((s) => createStep(s))
    return {
      ...createTask(pt.title),
      calendarId: calendar.id,
      steps,
      ...(day !== undefined ? { day } : {}),
    }
  })

  return { calendar, tasks }
}
