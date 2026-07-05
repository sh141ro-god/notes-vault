import { z } from 'zod'

export const NOTE_SCHEMA_VERSION = 1

/**
 * Доменная модель заметки. Все поля живут открытыми только в памяти; на диск
 * уходит целиком внутри зашифрованного блоба. Схема версионируется для будущих
 * миграций содержимого.
 */
export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().default(''),
  body: z.string().default(''), // markdown-исходник
  tagIds: z.array(z.string().uuid()).default([]),
  /** Момент последнего открытия (для «недавних» на главной). */
  lastOpenedAt: z.number().int().optional(),
  /** Сколько раз заметку открывали (для «частых» на главной). */
  openCount: z.number().int().nonnegative().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  schemaVersion: z.literal(NOTE_SCHEMA_VERSION),
})

export type Note = z.infer<typeof NoteSchema>

/** Создаёт новую пустую заметку со случайным UUIDv4 (CSPRNG). */
export function createNote(): Note {
  const now = Date.now()
  return {
    id: globalThis.crypto.randomUUID(),
    title: '',
    body: '',
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: NOTE_SCHEMA_VERSION,
  }
}

export function encodeNote(note: Note): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(note))
}

export function decodeNote(bytes: Uint8Array): Note {
  return NoteSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}
