import { isDayKey } from '@core/time/dayKey.ts'
import { z } from 'zod'

export const CALENDAR_SCHEMA_VERSION = 1

/** Палитра цветов календарей (та же гамма, что у тегов). */
export const CALENDAR_PALETTE = [
  '#e9b8c2',
  '#a8c8e6',
  '#a8e6c0',
  '#e6d4a8',
  '#c5a8e6',
  '#e6b8a8',
] as const

const COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Календарь-цель: контейнер задач под отдельную цель («Рисование»). «Основной»
 * календарь НЕ хранится как сущность — это задачи без `calendarId`. Горизонт
 * (`durationDays`/`startDay`) необязателен: у рутины его нет, у плана — есть.
 */
export const CalendarSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  color: z.string().regex(COLOR_RE),
  /** Длительность плана в днях (напр. 180 для 6 месяцев). Необязательно. */
  durationDays: z.number().int().positive().optional(),
  /** Дата старта плана (локальный YYYY-MM-DD). Необязательно. */
  startDay: z
    .string()
    .refine(isDayKey, { message: 'Некорректная дата старта' })
    .optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  schemaVersion: z.literal(CALENDAR_SCHEMA_VERSION),
})

export type Calendar = z.infer<typeof CalendarSchema>

export function createCalendar(name: string, color?: string): Calendar {
  const now = Date.now()
  return {
    id: globalThis.crypto.randomUUID(),
    name: name.trim(),
    color: color ?? CALENDAR_PALETTE[now % CALENDAR_PALETTE.length] ?? CALENDAR_PALETTE[0],
    createdAt: now,
    updatedAt: now,
    schemaVersion: CALENDAR_SCHEMA_VERSION,
  }
}
