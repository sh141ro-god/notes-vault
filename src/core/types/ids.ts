/**
 * Брендированные идентификаторы.
 *
 * Все id — строки (UUIDv4), но на уровне типов их нельзя перепутать между собой
 * или с обычной строкой. Конструкторы валидируют формат в одном месте.
 */

type Brand<T, B extends string> = T & { readonly __brand: B }

export type NoteId = Brand<string, 'NoteId'>
export type TagId = Brand<string, 'TagId'>

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Невалидный UUID: ${value}`)
  }
}

export function asNoteId(value: string): NoteId {
  assertUuid(value)
  return value as NoteId
}

export function asTagId(value: string): TagId {
  assertUuid(value)
  return value as TagId
}
