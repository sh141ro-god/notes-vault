import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { createTagRepository } from '@core/tags/tagRepository.ts'
import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'
import { todayKey } from '@core/time/dayKey.ts'

import { createTask, indexStatus, isTaskDone } from '../model.ts'
import { loadTaskIndex } from '../loadIndex.ts'
import { createTaskRepository } from '../taskRepository.ts'
import './tasks.css'

type GroupKey = 'overdue' | 'today' | 'upcoming' | 'done'
type FilterKey = 'all' | 'today' | 'overdue' | 'upcoming'

const GROUP_DEFS: { key: GroupKey; title: string; accent: boolean }[] = [
  { key: 'overdue', title: 'Просроченные', accent: false },
  { key: 'today', title: 'Сегодня', accent: true },
  { key: 'upcoming', title: 'Предстоящие', accent: false },
  { key: 'done', title: 'Выполнено', accent: false },
]

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'today', label: 'Сегодня' },
  { key: 'overdue', label: 'Просрочено' },
  { key: 'upcoming', label: 'Скоро' },
]

function groupOf(entry: ManifestEntry, now: number, today: string): GroupKey {
  const status = indexStatus(entry, now)
  if (status === 'done') return 'done'
  if (status === 'failed') return 'overdue'
  if (entry.day === today) return 'today'
  return 'upcoming'
}

function dueLabel(group: GroupKey, day: string | undefined): string {
  if (group === 'overdue') return 'провалено'
  if (group === 'today') return 'сегодня'
  if (day !== undefined) {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number]
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
      new Date(y, m - 1, d),
    )
  }
  return ''
}

export function TasksList(): React.JSX.Element {
  const services = useServices()
  const navigate = useNavigate()
  const repo = useMemo(() => createTaskRepository(services), [services])
  const tagRepo = useMemo(() => createTagRepository(services), [services])
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [tagMap, setTagMap] = useState<Map<string, { name: string; color: string }>>(
    new Map(),
  )
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setEntries(await loadTaskIndex(repo))
  }

  useEffect(() => {
    let active = true
    Promise.all([
      loadTaskIndex(repo),
      tagRepo.listAll(),
    ])
      .then(([index, tags]) => {
        if (active) {
          setEntries(index)
          setTagMap(new Map(tags.map((t) => [t.id, { name: t.name, color: t.color }])))
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(describeError(e))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [repo, tagRepo])

  async function onCreate(): Promise<void> {
    setError(null)
    try {
      const task = createTask()
      await repo.save(task)
      void navigate(`/tasks/${task.id}`)
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onToggle(entry: ManifestEntry): Promise<void> {
    const p = entry.progress
    if (p !== undefined && p.total > 1) {
      void navigate(`/tasks/${entry.id}`)
      return
    }
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

  const now = Date.now()
  const today = todayKey()

  const byGroup = useMemo(() => {
    const map: Record<GroupKey, ManifestEntry[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      done: [],
    }
    for (const e of entries) map[groupOf(e, now, today)].push(e)
    return map
  }, [entries, now, today])

  const openCount = entries.length - byGroup.done.length
  const total = entries.length
  const pct = total === 0 ? 0 : Math.round((byGroup.done.length / total) * 100)

  const filterCount = (k: FilterKey): number => {
    if (k === 'all') return openCount
    return byGroup[k].length
  }

  const visibleGroups = GROUP_DEFS.filter((g) => filter === 'all' || filter === g.key)

  // По тегам (открытые задачи)
  const byTag = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of entries) {
      if (indexStatus(e, now) === 'done') continue
      for (const id of e.tagIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ name: tagMap.get(id)?.name ?? '—', open: n }))
      .sort((a, b) => b.open - a.open)
  }, [entries, tagMap, now])

  function renderRow(entry: ManifestEntry, group: GroupKey): React.JSX.Element {
    const done = group === 'done'
    const due = dueLabel(group, entry.day)
    const p = entry.progress
    return (
      <div key={entry.id} className="tk__row">
        <button
          type="button"
          className={`tk__check${done ? ' tk__check--on' : ''}`}
          aria-label={done ? 'Снять отметку' : 'Выполнить'}
          onClick={() => { void onToggle(entry) }}
        >
          {done ? '✓' : ''}
        </button>
        <div className="tk__row-main">
          <Link
            to={`/tasks/${entry.id}`}
            className={`tk__title${done ? ' tk__title--done' : ''}`}
          >
            {entry.title !== undefined && entry.title !== '' ? entry.title : 'Без названия'}
          </Link>
          <div className="tk__meta">
            {due !== '' && (
              <span className={`tk__due mono${group === 'overdue' ? ' tk__due--bad' : ''}`}>
                {due}
              </span>
            )}
            {p !== undefined && p.total > 1 && (
              <span className="tk__chip mono">{p.done}/{p.total}</span>
            )}
            {(entry.tagIds ?? []).map((id) => {
              const info = tagMap.get(id)
              return info ? (
                <span
                  key={id}
                  className="tk__tag mono"
                  style={{ color: info.color, borderColor: info.color }}
                >
                  {info.name}
                </span>
              ) : null
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tk">
      <section className="tk__card glass-card">
        <header className="tk__head">
          <div className="tk__head-top">
            <h1>Задачи</h1>
            <span className="tk__open mono">{openCount} открыто</span>
            <button type="button" className="btn-primary tk__new" onClick={() => { void onCreate() }}>
              + Новая задача
            </button>
          </div>
          <div className="tk__filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`tk__filter mono${filter === f.key ? ' tk__filter--on' : ''}`}
                onClick={() => { setFilter(f.key) }}
              >
                {f.label} · {filterCount(f.key)}
              </button>
            ))}
          </div>
          <div className="tk__rule" />
        </header>

        <div className="tk__body">
          {error !== null && (
            <ErrorBanner message={error} onClose={() => { setError(null) }} />
          )}
          {loading ? (
            <p className="tk__muted">Загрузка…</p>
          ) : entries.length === 0 ? (
            <p className="tk__muted">Задач нет.</p>
          ) : (
            visibleGroups
              .map((g) => ({ g, rows: byGroup[g.key] }))
              .filter((x) => x.rows.length > 0)
              .map(({ g, rows }) => (
                <div key={g.key} className="tk__group">
                  <div className="tk__group-head">
                    <span className={`tk__dot${g.accent ? ' tk__dot--accent' : ''}`} />
                    <span className="label-mono">{g.title}</span>
                    <span className="tk__group-count mono">{rows.length}</span>
                  </div>
                  {rows.map((e) => renderRow(e, g.key))}
                </div>
              ))
          )}
        </div>
      </section>

      <aside className="tk__rail">
        <section className="tk__panel">
          <div className="label-mono">Прогресс</div>
          <div className="tk__progress">
            <span className="tk__pct mono">{pct}%</span>
            <span className="tk__progress-sub">
              {byGroup.done.length} из {total}
            </span>
          </div>
          <div className="tk__bar">
            <div className="tk__bar-fill" style={{ width: `${String(pct)}%` }} />
          </div>
        </section>

        <section className="tk__panel tk__panel--grow">
          <div className="label-mono">По тегам</div>
          <div className="tk__bytag">
            {byTag.length === 0 ? (
              <p className="tk__muted">Нет тегов.</p>
            ) : (
              byTag.map((t) => (
                <div key={t.name} className="tk__bytag-row">
                  <span className="tk__bytag-name">{t.name}</span>
                  <span className="tk__bytag-n mono">{t.open} откр.</span>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  )
}
