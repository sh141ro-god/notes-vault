import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'
import { isDayBeforeToday, todayKey } from '@core/time/dayKey.ts'

import { createTask, indexStatus, isTaskDone } from '../../tasks/model.ts'
import { loadTaskIndex } from '../../tasks/loadIndex.ts'
import { createTaskRepository } from '../../tasks/taskRepository.ts'
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

  const now0 = new Date()
  const [year, setYear] = useState(now0.getFullYear())
  const [month0, setMonth0] = useState(now0.getMonth())
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [selected, setSelected] = useState<string>(todayKey())
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setEntries(await loadTaskIndex(repo))
  }

  useEffect(() => {
    let active = true
    loadTaskIndex(repo)
      .then((index) => {
        if (active) setEntries(index)
      })
      .catch((e: unknown) => {
        if (active) setError(describeError(e))
      })
    return () => {
      active = false
    }
  }, [repo])

  const cells = useMemo(() => monthGrid(year, month0), [year, month0])
  const agg = useMemo(() => aggregateByDay(entries), [entries])
  const byDay = useMemo(() => {
    const map = new Map<string, ManifestEntry[]>()
    for (const e of entries) {
      if (e.day === undefined) continue
      const arr = map.get(e.day) ?? []
      arr.push(e)
      map.set(e.day, arr)
    }
    return map
  }, [entries])

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
      await repo.save({ ...createTask(text), day: selected })
      setTitle('')
      await reload()
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
          <div className="cl__legend mono">
            <span className="cl__leg"><span className="cl__leg-dot" />задачи</span>
          </div>
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
