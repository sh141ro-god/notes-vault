import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'

import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'
import { isDayBeforeToday, todayKey } from '@core/time/dayKey.ts'

import { createTask, indexStatus, isTaskDone } from '../../tasks/model.ts'
import { loadTaskIndex } from '../../tasks/loadIndex.ts'
import { createTaskRepository } from '../../tasks/taskRepository.ts'
import { type Calendar, createCalendar } from '../calendarEntity.ts'
import { createCalendarRepository } from '../calendarRepository.ts'
import { parseCalendarPlan } from '../calendarImport.ts'
import {
  aggregateByDay,
  dayRatioColor,
  monthGrid,
  monthLabel,
} from '../calendarModel.ts'
import './calendar.css'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function rgba(hex: string, alpha: number): string {
  if (hex === 'transparent') return 'transparent'
  const x = hex.replace('#', '')
  const r = parseInt(x.slice(0, 2), 16)
  const g = parseInt(x.slice(2, 4), 16)
  const b = parseInt(x.slice(4, 6), 16)
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`
}

function fmtSelected(key: string): { day: string; weekday: string; monthYear: string } {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date)
  const monthYear = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(date)
  return {
    day: String(d),
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    monthYear,
  }
}

export function CalendarPage(): React.JSX.Element {
  const services = useServices()
  const repo = useMemo(() => createTaskRepository(services), [services])
  const calRepo = useMemo(() => createCalendarRepository(services), [services])

  const now0 = new Date()
  const [year, setYear] = useState(now0.getFullYear())
  const [month0, setMonth0] = useState(now0.getMonth())
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  // undefined = «Основной» (задачи без calendarId).
  const [selectedCalendar, setSelectedCalendar] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<string>(todayKey())
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function reload(): Promise<void> {
    setEntries(await loadTaskIndex(repo))
  }
  async function reloadCalendars(): Promise<void> {
    setCalendars(await calRepo.listAll())
  }

  useEffect(() => {
    let active = true
    Promise.all([loadTaskIndex(repo), calRepo.listAll()])
      .then(([index, cals]) => {
        if (active) {
          setEntries(index)
          setCalendars(cals)
        }
      })
      .catch((e: unknown) => {
        if (active) setError(describeError(e))
      })
    return () => {
      active = false
    }
  }, [repo, calRepo])

  // Задачи выбранного календаря (Основной = calendarId отсутствует).
  const visible = useMemo(
    () => entries.filter((e) => e.calendarId === selectedCalendar),
    [entries, selectedCalendar],
  )

  const cells = useMemo(() => monthGrid(year, month0), [year, month0])
  const agg = useMemo(() => aggregateByDay(visible), [visible])
  const byDay = useMemo(() => {
    const map = new Map<string, ManifestEntry[]>()
    for (const e of visible) {
      if (e.day === undefined) continue
      const arr = map.get(e.day) ?? []
      arr.push(e)
      map.set(e.day, arr)
    }
    return map
  }, [visible])

  const today = todayKey()
  const nowMs = Date.now()

  function shiftMonth(delta: number): void {
    const date = new Date(year, month0 + delta, 1)
    setYear(date.getFullYear())
    setMonth0(date.getMonth())
  }

  function goToday(): void {
    const d = new Date()
    setYear(d.getFullYear())
    setMonth0(d.getMonth())
    setSelected(todayKey())
  }

  async function onQuickAdd(): Promise<void> {
    const text = title.trim()
    if (text === '') return
    setError(null)
    try {
      await repo.save({
        ...createTask(text),
        day: selected,
        ...(selectedCalendar !== undefined ? { calendarId: selectedCalendar } : {}),
      })
      setTitle('')
      await reload()
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onCreateCalendar(): Promise<void> {
    const name = newName.trim()
    if (name === '') return
    setError(null)
    try {
      const cal = createCalendar(name)
      await calRepo.save(cal)
      setNewName('')
      setCreating(false)
      await reloadCalendars()
      setSelectedCalendar(cal.id)
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onDeleteCalendar(): Promise<void> {
    if (selectedCalendar === undefined) return
    const cal = calendars.find((c) => c.id === selectedCalendar)
    if (!cal) return
    if (
      !window.confirm(
        `Удалить календарь «${cal.name}»? Его задачи вернутся в Основной, не удалятся.`,
      )
    ) {
      return
    }
    setError(null)
    try {
      // Задачи этого календаря переносим в Основной (снимаем calendarId).
      const affected = entries.filter((e) => e.calendarId === selectedCalendar)
      for (const entry of affected) {
        const task = await repo.get(entry.id)
        if (task) {
          const next = { ...task }
          delete next.calendarId
          await repo.save({ ...next, updatedAt: Date.now() })
        }
      }
      await calRepo.remove(selectedCalendar)
      setSelectedCalendar(undefined)
      await reloadCalendars()
      await reload()
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onImportFile(file: File): Promise<void> {
    setError(null)
    try {
      const { calendar, tasks } = parseCalendarPlan(await file.text())
      await calRepo.save(calendar)
      for (const task of tasks) {
        await repo.save(task)
      }
      await reloadCalendars()
      await reload()
      setSelectedCalendar(calendar.id)
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onToggle(entry: ManifestEntry): Promise<void> {
    const p = entry.progress
    if (p !== undefined && p.total > 1) return
    setError(null)
    try {
      const task = await repo.get(entry.id)
      if (!task) return
      await repo.save({ ...task, done: !isTaskDone(task), updatedAt: Date.now() })
      await reload()
    } catch (e) {
      setError(describeError(e))
    }
  }

  const dayTasks = byDay.get(selected) ?? []
  const sel = fmtSelected(selected)
  const doneSel = dayTasks.filter((e) => indexStatus(e, nowMs) === 'done').length

  return (
    <div className="cl">
      <section className="cl__card glass-card">
        {/* Переключатель календарей-целей */}
        <div className="cl__cals">
          <button
            type="button"
            className={`cl__cal${selectedCalendar === undefined ? ' cl__cal--on' : ''}`}
            onClick={() => { setSelectedCalendar(undefined) }}
          >
            Основной
          </button>
          {calendars.map((cal) => (
            <button
              key={cal.id}
              type="button"
              className={`cl__cal${selectedCalendar === cal.id ? ' cl__cal--on' : ''}`}
              style={{ borderColor: cal.color }}
              onClick={() => { setSelectedCalendar(cal.id) }}
            >
              {cal.name}
            </button>
          ))}
          <button
            type="button"
            className="cl__cal cl__cal--add"
            title="Новый календарь"
            onClick={() => { setCreating((v) => !v) }}
          >
            +
          </button>
          <button
            type="button"
            className="cl__cal cl__cal--import"
            title="Импорт плана"
            onClick={() => { fileRef.current?.click() }}
          >
            Импорт
          </button>
          {selectedCalendar !== undefined && (
            <button
              type="button"
              className="cl__cal cl__cal--del"
              title="Удалить этот календарь"
              onClick={() => { void onDeleteCalendar() }}
            >
              Удалить
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="cl__file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImportFile(file)
              event.target.value = ''
            }}
          />
        </div>
        {creating && (
          <form
            className="cl__cal-create"
            onSubmit={(event) => {
              event.preventDefault()
              void onCreateCalendar()
            }}
          >
            <input
              value={newName}
              placeholder="Название календаря-цели"
              onChange={(event) => { setNewName(event.target.value) }}
            />
            <button type="submit" className="btn-primary">Создать</button>
          </form>
        )}

        <header className="cl__head">
          <div className="cl__title-wrap">
            <h1 className="cl__title mono">{monthLabel(year, month0)}</h1>
          </div>
          <div className="cl__nav">
            <button type="button" onClick={() => { shiftMonth(-1) }} aria-label="Предыдущий месяц">‹</button>
            <button type="button" onClick={() => { shiftMonth(1) }} aria-label="Следующий месяц">›</button>
          </div>
          <button type="button" className="cl__today mono" onClick={() => { goToday() }}>
            Сегодня
          </button>
        </header>

        <div className="cl__weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w} className="cl__weekday mono">{w}</span>
          ))}
        </div>

        <div className="cl__grid">
          {cells.map((cell) => {
            const a = agg.get(cell.key)
            const past = isDayBeforeToday(cell.key, nowMs)
            const tint =
              past && a !== undefined && a.total > 0
                ? rgba(dayRatioColor(a.done, a.total), 0.2)
                : undefined
            const isToday = cell.key === today
            const isSel = cell.key === selected
            const events = (byDay.get(cell.key) ?? []).slice(0, 2)
            const more = (byDay.get(cell.key)?.length ?? 0) - events.length
            const classes = [
              'cl__cell',
              cell.inMonth ? '' : 'cl__cell--out',
              isSel ? 'cl__cell--sel' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={cell.key}
                type="button"
                className={classes}
                style={tint !== undefined ? { background: tint } : undefined}
                onClick={() => { setSelected(cell.key) }}
              >
                <span className={`cl__num mono${isToday ? ' cl__num--today' : ''}`}>
                  {cell.day}
                </span>
                <span className="cl__events">
                  {events.map((e) => (
                    <span key={e.id} className="cl__event">
                      <span className="cl__event-dot" />
                      <span className="cl__event-label">
                        {e.title !== undefined && e.title !== '' ? e.title : 'Без названия'}
                      </span>
                    </span>
                  ))}
                  {more > 0 && <span className="cl__more mono">+{more}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <aside className="cl__rail">
        <section className="cl__day">
          <div className="cl__day-head">
            <span className="cl__day-num mono">{sel.day}</span>
            <div>
              <div className="cl__day-wd">{sel.weekday}</div>
              <div className="cl__day-my mono">{sel.monthYear}</div>
            </div>
          </div>
          <div className="cl__day-rule" />

          {error !== null && (
            <ErrorBanner message={error} onClose={() => { setError(null) }} />
          )}

          <div className="cl__day-tasks-head">
            <span className="label-mono">Задачи дня</span>
            <span className="cl__day-meta mono">{doneSel}/{dayTasks.length}</span>
          </div>

          <form
            className="cl__quick"
            onSubmit={(event) => {
              event.preventDefault()
              void onQuickAdd()
            }}
          >
            <input
              value={title}
              placeholder="Новая задача на этот день"
              onChange={(event) => { setTitle(event.target.value) }}
            />
            <button type="submit" className="btn-primary">Добавить</button>
          </form>

          <div className="cl__day-list">
            {dayTasks.length === 0 ? (
              <p className="cl__muted">Задач на этот день нет.</p>
            ) : (
              dayTasks.map((entry) => {
                const status = indexStatus(entry, nowMs)
                const done = status === 'done'
                return (
                  <div key={entry.id} className="cl__task">
                    <button
                      type="button"
                      className={`cl__check${done ? ' cl__check--on' : ''}`}
                      aria-label={done ? 'Снять отметку' : 'Выполнить'}
                      onClick={() => { void onToggle(entry) }}
                    >
                      {done ? '✓' : ''}
                    </button>
                    <Link
                      to={`/tasks/${entry.id}`}
                      className={`cl__task-title${done ? ' cl__task-title--done' : ''}`}
                    >
                      {entry.title !== undefined && entry.title !== '' ? entry.title : 'Без названия'}
                    </Link>
                    {status === 'failed' && <span className="cl__flag mono">провалено</span>}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </aside>
    </div>
  )
}
