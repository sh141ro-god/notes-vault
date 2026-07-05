import { z } from 'zod'

/**
 * Манифест коллекции — лёгкий зашифрованный индекс записей. Хранится в IndexedDB
 * как Envelope (на покое заголовки защищены DEK); эта схема описывает его
 * РАСШИФРОВАННОЕ содержимое и применяется потребителями после дешифровки.
 *
 * v2: доменно-нейтральный (entries) + опциональный денормализованный title.
 * v3: к индексу добавлены строго ОГРАНИЧЕННЫЕ денормализованные поля для фич,
 * которым нужно читать метаданные многих записей без расшифровки тел:
 *   - tagIds       — id тегов (имена остаются в зашифрованной коллекции tags);
 *   - day          — день привязки (локальный YYYY-MM-DD) для календаря;
 *   - lastOpenedAt — момент последнего открытия (недавние на главной);
 *   - progress     — выполнено/всего шагов (раскраска дня, статус цепочки).
 * Всё это лежит ВНУТРИ зашифрованного манифеста, поэтому утечки на покое не
 * добавляет. Полные тела по-прежнему хранятся в отдельных блобах — в манифест
 * не кладётся ничего объёмного (никаких тел/markdown).
 */
export const MANIFEST_SCHEMA_VERSION = 3

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export const ManifestProgressSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type ManifestProgress = z.infer<typeof ManifestProgressSchema>

export const ManifestEntrySchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.number().int(),
  /** Денормализованный заголовок для дешёвого списка (источник истины — блоб). */
  title: z.string().optional(),
  /** id привязанных тегов (имена — в зашифрованной коллекции tags). */
  tagIds: z.array(z.string().uuid()).optional(),
  /** День привязки, локальный YYYY-MM-DD (для календаря/провала). */
  day: z.string().regex(DAY_KEY_RE).optional(),
  /** Момент последнего открытия записи (для «недавних»). */
  lastOpenedAt: z.number().int().optional(),
  /** Сколько раз запись открывали (для «частых» на главной). */
  openCount: z.number().int().nonnegative().optional(),
  /** Прогресс цепочки/чеклиста: выполнено из общего. */
  progress: ManifestProgressSchema.optional(),
})
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>

/**
 * Денормализуемые в индекс поля, которые доменный репозиторий проецирует из
 * сущности (toIndex). id/updatedAt добавляются репозиторием отдельно.
 */
export type ManifestIndexFields = Pick<
  ManifestEntry,
  'title' | 'tagIds' | 'day' | 'lastOpenedAt' | 'openCount' | 'progress'
>

export const ManifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  entries: z.array(ManifestEntrySchema),
})
export type Manifest = z.infer<typeof ManifestSchema>

/** Форма v2: те же entries (новые поля просто отсутствуют — все опциональны). */
const ManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  entries: z.array(ManifestEntrySchema),
})

/** Старая форма манифеста заметок (до обобщения хранилища). */
const ManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  notes: z.array(
    z.object({ id: z.string().uuid(), updatedAt: z.number().int() }),
  ),
})

/**
 * Разбирает расшифрованный манифест, поднимая старые формы 1→3 и 2→3 на лету.
 * Миграция содержимого манифеста делается здесь (а не в upgrade IndexedDB),
 * потому что оно внутри конверта и доступно только с DEK. Поскольку все новые
 * поля опциональны, формы v2 и v3 совместимы по записям — апгрейд лишь меняет
 * метку версии.
 */
export function parseManifest(data: unknown): Manifest {
  const v3 = ManifestSchema.safeParse(data)
  if (v3.success) {
    return v3.data
  }
  const v2 = ManifestV2Schema.safeParse(data)
  if (v2.success) {
    return { schemaVersion: MANIFEST_SCHEMA_VERSION, entries: v2.data.entries }
  }
  const v1 = ManifestV1Schema.parse(data)
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    entries: v1.notes.map((note) => ({
      id: note.id,
      updatedAt: note.updatedAt,
    })),
  }
}

export function emptyManifest(): Manifest {
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, entries: [] }
}
