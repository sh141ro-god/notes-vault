import { dayKey } from '@core/time/dayKey.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'

/**
 * Цвета раскраски дня (доля выполненных задач): A — 0%, B — 100%. Заданы здесь
 * как токены, легко поменять в одном месте. Дни без задач не красятся вовсе.
 */
export const RATIO_COLOR_A = '#ef4444' // красный (ничего не сделано)
export const RATIO_COLOR_B = '#22c55e' // зелёный (всё сделано)

export interface DayCell {
  /** Локальный ключ дня YYYY-MM-DD. */
  key: string
  /** Число месяца (1..31). */
  day: number
  /** Принадлежит ли отображаемому месяцу (false — «хвосты» соседних месяцев). */
  inMonth: boolean
}

export interface DayAgg {
  total: number
  done: number
}

/** Сетка месяца: 6 недель × 7 дней, неделя с понедельника. */
export function monthGrid(year: number, month0: number): DayCell[] {
  const first = new Date(year, month0, 1)
  const offset = (first.getDay() + 6) % 7 // сколько дней-хвостов слева до понедельника
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month0, 1 - offset + i)
    cells.push({
      key: dayKey(d.getTime()),
      day: d.getDate(),
      inMonth: d.getMonth() === month0,
    })
  }
  return cells
}

/** Заголовок месяца, например «июнь 2026». */
export function monthLabel(year: number, month0: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month0, 1))
}

/** Задача считается выполненной по индексу: progress.done === total (total > 0). */
function isEntryDone(entry: ManifestEntry): boolean {
  const p = entry.progress
  return p !== undefined && p.total > 0 && p.done === p.total
}

/** Агрегирует задачи по дню привязки: всего и выполнено. */
export function aggregateByDay(entries: ManifestEntry[]): Map<string, DayAgg> {
  const map = new Map<string, DayAgg>()
  for (const entry of entries) {
    if (entry.day === undefined) {
      continue
    }
    const agg = map.get(entry.day) ?? { total: 0, done: 0 }
    agg.total += 1
    if (isEntryDone(entry)) {
      agg.done += 1
    }
    map.set(entry.day, agg)
  }
  return map
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function channel(hex: string, start: number): number {
  return parseInt(hex.slice(start, start + 2), 16)
}

function toHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0')
}

/** Линейная интерполяция двух HEX-цветов (#rrggbb) по доле t∈[0,1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const k = clamp01(t)
  const ax = a.replace('#', '')
  const bx = b.replace('#', '')
  const r = channel(ax, 0) + (channel(bx, 0) - channel(ax, 0)) * k
  const g = channel(ax, 2) + (channel(bx, 2) - channel(ax, 2)) * k
  const bl = channel(ax, 4) + (channel(bx, 4) - channel(ax, 4)) * k
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

/** Цвет дня по доле выполненных задач (A→B). */
export function dayRatioColor(done: number, total: number): string {
  if (total <= 0) {
    return 'transparent'
  }
  return lerpColor(RATIO_COLOR_A, RATIO_COLOR_B, done / total)
}
