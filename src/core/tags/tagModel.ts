import { z } from 'zod'

export const TAG_SCHEMA_VERSION = 1

/** Палитра цветов тегов по умолчанию (HEX). UI выбирает из неё. */
export const TAG_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

const COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Тег — запись центрального реестра (коллекция `tags`). Имя — пользовательский
 * контент, поэтому живёт только внутри зашифрованного блоба; сущности (заметки,
 * задачи) ссылаются на тег по `id`, а в индексе манифеста хранятся лишь id —
 * имена на покое не раскрываются.
 */
export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  color: z.string().regex(COLOR_RE),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  schemaVersion: z.literal(TAG_SCHEMA_VERSION),
})

export type Tag = z.infer<typeof TagSchema>

/** Создаёт тег со случайным UUIDv4 (CSPRNG). Цвет по умолчанию — из палитры. */
export function createTag(name: string, color?: string): Tag {
  const now = Date.now()
  return {
    id: globalThis.crypto.randomUUID(),
    name: name.trim(),
    color: color ?? TAG_PALETTE[now % TAG_PALETTE.length] ?? TAG_PALETTE[0],
    createdAt: now,
    updatedAt: now,
    schemaVersion: TAG_SCHEMA_VERSION,
  }
}
