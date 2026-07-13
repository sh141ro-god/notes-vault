import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { TagPicker } from '@core/tags/ui/TagPicker.tsx'
import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import { type Calendar } from '@core/calendars/calendarEntity.ts'
import { createCalendarRepository } from '@core/calendars/calendarRepository.ts'

import {
  canToggleStep,
  createStep,
  type Task,
  taskStatus,
  toggleStep,
} from '../model.ts'
import { createTaskRepository } from '../taskRepository.ts'
import './tasks.css'

type LoadState = 'loading' | 'ready' | 'notfound'

const STATUS_LABEL = {
  done: 'Выполнено',
  failed: 'Провалено',
  pending: 'Активна',
} as const

/** Снимает привязку ко дню (exactOptionalPropertyTypes — удаляем ключ). */
function detachDay(task: Task): Task {
  const next: Task = { ...task }
  delete next.day
  return next
}

/** Снимает привязку к календарю (→ Основной). */
function detachCalendar(task: Task): Task {
  const next: Task = { ...task }
  delete next.calendarId
  return next
}

export function TaskEditor(): React.JSX.Element {
  const services = useServices()
  const navigate = useNavigate()
  const { id } = useParams()
  const repo = useMemo(() => createTaskRepository(services), [services])
  const calRepo = useMemo(() => createCalendarRepository(services), [services])
  const [task, setTask] = useState<Task | undefined>(undefined)
  const [load, setLoad] = useState<LoadState>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<Calendar[]>([])

  useEffect(() => {
    if (id === undefined) {
      setLoad('notfound')
      return
    }
    let active = true
    repo
      .get(id)
      .then((found) => {
        if (!active) {
          return
        }
        if (found) {
          setTask(found)
          setLoad('ready')
        } else {
          setLoad('notfound')
        }
      })
      .catch((e: unknown) => {
        if (active) {
          // UI-02: ошибка загрузки (залоченный волт, сбой IndexedDB) — это не
          // «задача не найдена». Показываем реальную причину, а не молчим.
          setError(describeError(e))
          setLoad('notfound')
        }
      })
    return () => {
      active = false
    }
  }, [repo, id])

  useEffect(() => {
    let active = true
    void calRepo.listAll().then((cals) => {
      if (active) setCalendars(cals)
    })
    return () => {
      active = false
    }
  }, [calRepo])

  async function onSave(current: Task): Promise<void> {
    setError(null)
    setSaving(true)
    try {
      await repo.save({ ...current, updatedAt: Date.now() })
      void navigate('/tasks')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(current: Task): Promise<void> {
    setError(null)
    try {
      await repo.remove(current.id)
      void navigate('/tasks')
    } catch (e) {
      setError(describeError(e))
    }
  }

  if (load === 'loading') {
    return (
      <section className="tasks">
        <p>Загрузка…</p>
      </section>
    )
  }
  if (load === 'notfound' || !task) {
    return (
      <section className="tasks">
        {error !== null && (
          <ErrorBanner
            message={error}
            onClose={() => {
              setError(null)
            }}
          />
        )}
        <p>{error !== null ? 'Не удалось загрузить задачу.' : 'Задача не найдена.'}</p>
        <button
          type="button"
          onClick={() => {
            void navigate('/tasks')
          }}
        >
          К списку
        </button>
      </section>
    )
  }

  const current = task
  const status = taskStatus(current)

  return (
    <section className="tasks tasks--editor">
      {error !== null && (
        <ErrorBanner
          message={error}
          onClose={() => {
            setError(null)
          }}
        />
      )}
      <header className="tasks__header">
        <button
          type="button"
          onClick={() => {
            void navigate('/tasks')
          }}
        >
          ← Назад
        </button>
        <span className={`tasks__badge tasks__badge--${status}`}>
          {STATUS_LABEL[status]}
        </span>
        <div>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void onSave(current)
            }}
          >
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button
            type="button"
            aria-label="Удалить задачу"
            onClick={() => {
              void onDelete(current)
            }}
          >
            Удалить
          </button>
        </div>
      </header>

      <input
        className="tasks__title-input"
        placeholder="Название задачи"
        value={current.title}
        onChange={(event) => {
          setTask({ ...current, title: event.target.value })
        }}
      />

      <div className="tasks__field">
        <span>День</span>
        {current.day !== undefined ? (
          <div className="tasks__day-row">
            <span className="tasks__day-value">{current.day}</span>
            <button
              type="button"
              onClick={() => {
                setTask(detachDay(current))
              }}
            >
              Открепить
            </button>
          </div>
        ) : (
          <p className="tasks__muted">
            Без даты. Прикрепить ко дню можно на Главной (сегодня) или в Календаре.
          </p>
        )}
      </div>

      <div className="tasks__field">
        <span>Календарь</span>
        <select
          className="tasks__calendar"
          value={current.calendarId ?? ''}
          onChange={(event) => {
            const value = event.target.value
            setTask(value === '' ? detachCalendar(current) : { ...current, calendarId: value })
          }}
        >
          <option value="">Основной</option>
          {calendars.map((cal) => (
            <option key={cal.id} value={cal.id}>
              {cal.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tasks__field">
        <span>Теги</span>
        <TagPicker
          selected={current.tagIds}
          onChange={(tagIds) => {
            setTask({ ...current, tagIds })
          }}
        />
      </div>

      <div className="tasks__steps">
        <div className="tasks__steps-head">
          <span>Шаги цепочки (жёсткий порядок)</span>
          <button
            type="button"
            onClick={() => {
              setTask({ ...current, steps: [...current.steps, createStep('')] })
            }}
          >
            + шаг
          </button>
        </div>

        {current.steps.length === 0 ? (
          <label className="tasks__single">
            <input
              type="checkbox"
              checked={current.done}
              onChange={() => {
                setTask({ ...current, done: !current.done })
              }}
            />
            Одиночная цель выполнена (или добавьте шаги, чтобы сделать цепочку)
          </label>
        ) : (
          <ol className="tasks__steplist">
            {current.steps.map((step, index) => {
              const locked = !step.done && !canToggleStep(current, index)
              return (
                <li key={step.id} className="tasks__step">
                  <input
                    type="checkbox"
                    checked={step.done}
                    disabled={locked}
                    title={locked ? 'Сначала закройте предыдущие шаги' : undefined}
                    onChange={() => {
                      setTask(toggleStep(current, step.id))
                    }}
                  />
                  <input
                               className="tasks__step-title"
                    placeholder={`Шаг ${String(index + 1)}`}
                    value={step.title}
                    onChange={(event) => {
                      const title = event.target.value
                      setTask({
                        ...current,
                        steps: current.steps.map((s) =>
                          s.id === step.id ? { ...s, title } : s,
                        ),
                      })
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Удалить шаг"
                    onClick={() => {
                      setTask({
                        ...current,
                        steps: current.steps.filter((s) => s.id !== step.id),
                      })
                    }}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
