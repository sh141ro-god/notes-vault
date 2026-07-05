import { describe, expect, it } from 'vitest'

import { emptyManifest, parseManifest } from './manifest.ts'

const ID = '11111111-1111-4111-8111-111111111111'

describe('manifest', () => {
  it('читает форму v3 с индекс-полями', () => {
    const m = parseManifest({
      schemaVersion: 3,
      entries: [
        {
          id: ID,
          updatedAt: 5,
          title: 'A',
          tagIds: [ID],
          day: '2026-06-23',
          lastOpenedAt: 9,
          progress: { done: 1, total: 3 },
        },
      ],
    })
    expect(m.entries[0]?.day).toBe('2026-06-23')
    expect(m.entries[0]?.progress).toEqual({ done: 1, total: 3 })
  })

  it('поднимает форму v2 → v3 (entries совместимы, меняется версия)', () => {
    const m = parseManifest({
      schemaVersion: 2,
      entries: [{ id: ID, updatedAt: 5, title: 'A' }],
    })
    expect(m.schemaVersion).toBe(3)
    expect(m.entries[0]?.title).toBe('A')
  })

  it('поднимает форму v1 → v3 (notes → entries, без title)', () => {
    const m = parseManifest({
      schemaVersion: 1,
      notes: [{ id: ID, updatedAt: 7 }],
    })
    expect(m.schemaVersion).toBe(3)
    expect(m.entries).toEqual([{ id: ID, updatedAt: 7 }])
  })

  it('отвергает мусор', () => {
    expect(() => parseManifest({ schemaVersion: 9 })).toThrow()
  })

  it('отвергает некорректный day', () => {
    expect(() =>
      parseManifest({
        schemaVersion: 3,
        entries: [{ id: ID, updatedAt: 1, day: '23.06.2026' }],
      }),
    ).toThrow()
  })

  it('emptyManifest пуст и версии 3', () => {
    expect(emptyManifest()).toEqual({ schemaVersion: 3, entries: [] })
  })
})
