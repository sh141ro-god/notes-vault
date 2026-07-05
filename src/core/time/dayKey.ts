/**
 * Утилиты «дня» в ЛОКАЛЬНОМ времени устройства.
 *
 * Приложение офлайн-first без сервера, поэтому единственный доступный источник
 * времени — часы устройства. «День» — это локальный календарный день (а не UTC),
 * чтобы граница суток совпадала с интуицией пользователя. Ключ дня — строка
 * `YYYY-MM-DD`; она же кладётся в индекс манифеста (`day`).
 *
 * Доверие к часам устройства — осознанная часть модели угроз: пользователь
 * работает на своём устройстве, перевод часов влияет лишь на его же статистику.
 */

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value)
}

/**
 * Истинно, если строка — корректный локальный ключ дня `YYYY-MM-DD`. Проверяется
 * не только форма, но и существование даты (DATA-04): `2026-02-31`/`2026-13-40`
 * проходят regex, но не являются реальными днями — их надо отвергать, иначе такой
 * ключ молча «переедет» на другой день в календаре.
 */
export function isDayKey(value: string): boolean {
  if (!DAY_KEY_RE.test(value)) {
    return false
  }
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  )
}

/** Локальный ключ дня (`YYYY-MM-DD`) для указанного момента (по умолчанию — сейчас). */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts)
  return `${String(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Ключ сегодняшнего дня по часам устройства. */
export function todayKey(now: number = Date.now()): string {
  return dayKey(now)
}

/** Разбирает ключ дня в [год, месяц(1-12), число]; бросает на некорректном вводе. */
function parseDayKey(key: string): [number, number, number] {
  if (!isDayKey(key)) {
    throw new Error(`Некорректный ключ дня: ${key}`)
  }
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return [y, m, d]
}

/** Локальная полночь начала дня (мс). */
export function startOfDayMs(key: string): number {
  const [y, m, d] = parseDayKey(key)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

/** Последняя миллисекунда локального дня (23:59:59.999). */
export function endOfDayMs(key: string): number {
  const [y, m, d] = parseDayKey(key)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/** Истинно, если день уже полностью закончился к моменту `now` (строго в прошлом). */
export function isDayBeforeToday(key: string, now: number = Date.now()): boolean {
  return now > endOfDayMs(key)
}

/** Истинно, если день — сегодняшний по часам устройства. */
export function isToday(key: string, now: number = Date.now()): boolean {
  return key === todayKey(now)
}
