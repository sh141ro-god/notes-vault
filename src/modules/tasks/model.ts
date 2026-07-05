import { isDayBeforeToday, isDayKey } from '@core/time/dayKey.ts'
import { z } from 'zod'

export const TASK_SCHEMA_VERSION = 2

/** Шаг цепочки. Порядок в массиве = порядок выполнения (жёсткая зависимость). */
export const TaskStepSchema = z.object({
  id: z.string().uuid(),
  title: z.string().default(''),
  done: z.boolean().default(false),
})
export type TaskStep = z.infer<typeof TaskStepSchema>

/**
 * Доменная модель задачи (v2). Одиночная цель = пустые `steps` + флаг `done`.
 * Цепочка = непустые `steps` с жёсткой зависимостью (шаг N нельзя закрыть, пока
 * не закрыты предыдущие); готовность цепочки выводится из шагов. Привязка к дню
 * (`day`, локальный YYYY-MM-DD) опциональна — без неё задача в «бэклоге» и не
 * может быть провалена. Всё уходит на диск внутри зашифрованного блоба.
 */
const TaskV2Schema = z.object({
  id: z.string().uuid(),
  title: z.string().default(''),
  steps: z.array(TaskStepSchema).default([]),
  done: z.boolean().default(false),
  day: z
    .string()
    .refine(isDayKey, { message: 'Некорректный ключ дня' })
    .optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  schemaVersion: z.literal(TASK_SCHEMA_VERSION),
})

export type Task = z.infer<typeof TaskV2Schema>

/** Поднимает старую форму v1 ({done}) к v2 (пустые steps/tagIds, без дня). */
function upgradeTask(raw: unknown): unknown {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    (raw as { schemaVersion?: unknown }).schemaVersion === 1
  ) {
    const v1 = raw as {
      id: string
      title?: string
      done?: boolean
      createdAt: number
      updatedAt: number
    }
    return {
      id: v1.id,
      title: v1.title ?? '',
      steps: [],
      done: v1.done ?? false,
      tagIds: [],
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      schemaVersion: TASK_SCHEMA_VERSION,
    }
  }
  return raw
}

/** Схема для репозитория: миграция v1→v2 «на лету», затем валидация v2. */
export const TaskSchema = z.preprocess(upgradeTask, TaskV2Schema)

export function createTask(title = ''): Task {
  const now = Date.now()
  return {
    id: globalThis.crypto.randomUUID(),
    title,
    steps: [],
    done: false,
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: TASK_SCHEMA_VERSION,
  }
}

export function createStep(title = ''): TaskStep {
  return { id: globalThis.crypto.randomUUID(), title, done: false }
}

export type TaskStatus = 'done' | 'pending' | 'failed'

/** Готовность: для цепочки — все шаги done; для одиночной — флаг done. */
export function isTaskDone(task: Task): boolean {
  return task.steps.length > 0 ? task.steps.every((s) => s.done) : task.done
}

/** Прогресс выполнено/всего: по шагам, либо 0/1 для одиночной цели. */
export function taskProgress(task: Task): { done: number; total: number } {
  if (task.steps.length > 0) {
    return {
      done: task.steps.filter((s) => s.done).length,
      total: task.steps.length,
    }
  }
  return { done: task.done ? 1 : 0, total: 1 }
}

/**
 * Производный статус по часам устройства (НИЧЕГО не персистится): выполненная —
 * done; невыполненная с привязкой к прошедшему дню — failed; иначе — pending.
 */
export function taskStatus(task: Task, now: number = Date.now()): TaskStatus {
  if (isTaskDone(task)) {
    return 'done'
  }
  if (task.day !== undefined && isDayBeforeToday(task.day, now)) {
    return 'failed'
  }
  return 'pending'
}

/** То же по полям индекса манифеста (без расшифровки тела). */
export function indexStatus(
  entry: {
    progress?: { done: number; total: number } | undefined
    day?: string | undefined
  },
  now: number = Date.now(),
): TaskStatus {
  const p = entry.progress
  const done = p !== undefined && p.total > 0 && p.done === p.total
  if (done) {
    return 'done'
  }
  if (entry.day !== undefined && isDayBeforeToday(entry.day, now)) {
    return 'failed'
  }
  return 'pending'
}

/** Жёсткая цепочка: шаг index можно отметить, только если все предыдущие done. */
export function canToggleStep(task: Task, index: number): boolean {
  return task.steps.slice(0, index).every((s) => s.done)
}

/**
 * Переключает шаг с соблюдением порядка. Установка соблюдает зависимость (нельзя
 * вперёд незакрытых предыдущих). Снятие сбрасывает все последующие — иначе
 * остались бы «висящие» шаги после невыполненного предшественника.
 */
export function toggleStep(task: Task, stepId: string): Task {
  const index = task.steps.findIndex((s) => s.id === stepId)
  if (index < 0) {
    return task
  }
  const step = task.steps[index]
  if (step === undefined) {
    return task
  }
  if (step.done) {
    const steps = task.steps.map((s, i) => (i >= index ? { ...s, done: false } : s))
    return { ...task, steps, updatedAt: Date.now() }
  }
  if (!canToggleStep(task, index)) {
    return task
  }
  const steps = task.steps.map((s, i) => (i === index ? { ...s, done: true } : s))
  return { ...task, steps, updatedAt: Date.now() }
}
