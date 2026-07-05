import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { createTagRepository } from '@core/tags/tagRepository.ts'
import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'
import { todayKey } from '@core/time/dayKey.ts'

import { createTask, indexStatus, isTaskDone } from '../../tasks/model.ts'
import { loadTaskIndex } from '../../tasks/loadIndex.ts'
import { createTaskRepository } from '../../tasks/taskRepository.ts'
import { createNoteRepository } from '../../notes/noteRepository.ts'
import './home.css'

const RECENT_LIMIT = 9

interface RecentNote {
  id: string
  title: string
  when: string
  excerpt: string
  tag: string | undefined
}

function greeting(now: number): string {
  const h = new Date(now).getHours()
  if (h < 6) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n)
}

function relWhen(ts: number, now: number): string {
  const day = 86_400_000
  const start = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((start(new Date(now)) - start(new Date(ts))) / day)
  if (diff <= 0) {
    const d = new Date(ts)
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  if (diff === 1) return 'вчера'
  if (diff < 7) return `${String(diff)} дн`
  return `${String(Math.floor(diff / 7))} нед`
}

function excerptOf(body: string): string {
  return body
    .replace(/[#>*`_~[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

export function HomePage(): React.JSX.Element {
  const services = useServices()
  const navigate = useNavigate()
  const taskRepo = useMemo(() => createTaskRepository(services), [services])
  const noteRepo = useMemo(() => createNoteRepository(services), [services])
  const tagRepo = useMemo(() => createTagRepository(services), [services])

  const today = todayKey()
  const [todayTasks, setTodayTasks] = useState<ManifestEntry[]>([])
  const [recent, setRecent] = useState<RecentNote[]>([])
  const [noteTotal, setNoteTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadTodayTasks(): Promise<ManifestEntry[]> {
    const index = await loadTaskIndex(taskRepo)
    return index.filter((entry) => entry.day === today)
  }

  async function loadRecent(now: number): Promise<{ list: RecentNote[]; total: number }> {
    const index = await noteRepo.listIndex()
    const tags = new Map((await tagRepo.listAll()).map((t) => [t.id, t.name]))
    const top = [...index]
      .sort(
        (a, b) =>
          (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt),
      )
      .slice(0, RECENT_LIMIT)
    const list = await Promise.all(
      top.map(async (e): Promise<RecentNote> => {
        const full = await noteRepo.get(e.id)
        const tagId = e.tagIds?.[0]
        return {
          id: e.id,
          title: e.title !== undefined && e.title !== '' ? e.title : 'Без названия',
          when: relWhen(e.lastOpenedAt ?? e.updatedAt, now),
          excerpt: excerptOf(full?.body ?? ''),
          tag: tagId !== undefined ? tags.get(tagId) : undefined,
        }
      }),
    )
    return { list, total: index.length }
  }

  async function reloadTasks(): Promise<void> {
    setTodayTasks(await loadTodayTasks())
  }

  useEffect(() => {
    let active = true
    const now = Date.now()
    Promise.all([loadTodayTasks(), loadRecent(now)])
      .then(([tasks, notes]) => {
        if (active) {
          setTodayTasks(tasks)
          setRecent(notes.list)
          setNoteTotal(notes.total)
        }
      })
      .catch((e: unknown) => {
        if (active) setError(describeError(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [taskRepo, noteRepo, tagRepo])

  async function onNewTask(): Promise<void> {
    setError(null)
    try {
      const task = { ...createTask(), day: today }
      await taskRepo.save(task)
      void navigate(`/tasks/${task.id}`)
    } catch (e) {
      setError(describeError(e))
    }
  }

  async function onToggleTask(entry: ManifestEntry): Promise<void> {
    const p = entry.progress
    if (p !== undefined && p.total > 1) {
      void navigate(`/tasks/${entry.id}`)
      return
    }
    setError(null)
    try {
      const task = await taskRepo.get(entry.id)
      if (!task) return
      await taskRepo.save({ ...task, done: !isTaskDone(task), updatedAt: Date.now() })
      await reloadTasks()
    } catch (e) {
      setError(describeError(e))
    }
  }

  const now = Date.now()
  const d = new Date(now)
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(d)
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(d)
  const doneToday = todayTasks.filter((e) => indexStatus(e, now) === 'done').length

  return (
    <div className="home">
      <section className="home__card glass-card">
        <header className="home__head">
          <div className="label-mono">{weekday}</div>
          <div className="home__dateline">
            <h1 className="home__daynum mono">{String(d.getDate())}</h1>
            <div className="home__monthyear mono">
              {month}
              <br />
              {String(d.getFullYear())}
            </div>
            <span className="home__greeting mono">
              <span className="home__dot" />
              {greeting(now)}
            </span>
          </div>
          <div className="home__rule" />
        </header>

        <div className="home__body">
          {error !== null && (
            <ErrorBanner message={error} onClose={() => { setError(null) }} />
          )}
          <div className="home__tasks-head">
            <span className="label-mono">Задачи на сегодня</span>
            <span className="home__badge mono">{doneToday}/{todayTasks.length}</span>
            <button
              type="button"
              className="home__add-mini"
              title="Добавить задачу"
              onClick={() => { void onNewTask() }}
            >
              +
            </button>
          </div>

          {loading ? (
            <p className="home__muted">Загрузка…</p>
          ) : todayTasks.length === 0 ? (
            <p className="home__muted">На сегодня задач нет.</p>
          ) : (
            todayTasks.map((entry) => {
              const status = indexStatus(entry, now)
              const done = status === 'done'
              return (
                <div key={entry.id} className="home__task">
                  <button
                    type="button"
                    className={`home__check${done ? ' home__check--on' : ''}`}
                    aria-label={done ? 'Снять отметку' : 'Выполнить'}
                    onClick={() => { void onToggleTask(entry) }}
                  >
                    {done ? '✓' : ''}
                  </button>
                  <Link
                    to={`/tasks/${entry.id}`}
                    className={`home__task-title${done ? ' home__task-title--done' : ''}`}
                  >
                    {entry.title !== undefined && entry.title !== ''
                      ? entry.title
                      : 'Без названия'}
                  </Link>
                  {status === 'failed' && (
                    <span className="home__flag mono">провалено</span>
                  )}
                </div>
              )
            })
          )}

          <button
            type="button"
            className="home__add-dashed"
            onClick={() => { void onNewTask() }}
          >
            <span className="home__add-plus">+</span> Новая задача
          </button>
        </div>
      </section>

      <aside className="home__rail">
        <section className="home__notecard">
          <div className="home__notecard-head">
            <h2>Последние заметки</h2>
            <span className="home__count mono">{noteTotal}</span>
          </div>
          <div className="home__notes">
            {loading ? (
              <p className="home__muted">Загрузка…</p>
            ) : recent.length === 0 ? (
              <p className="home__muted">Заметок пока нет.</p>
            ) : (
              recent.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`} className="home__note">
                  <div className="home__note-top">
                    <span className="home__note-title">{n.title}</span>
                    <span className="home__note-when mono">{n.when}</span>
                  </div>
                  {n.excerpt !== '' && <p className="home__note-excerpt">{n.excerpt}</p>}
                  {n.tag !== undefined && (
                    <span className="home__note-tag mono">#{n.tag}</span>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  )
}
