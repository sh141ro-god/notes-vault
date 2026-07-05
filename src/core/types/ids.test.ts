import { describe, expect, it } from 'vitest'

import { asNoteId, asTagId } from './ids.ts'

const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('ids', () => {
  it('принимает валидный UUID', () => {
    expect(asNoteId(VALID_UUID)).toBe(VALID_UUID)
    expect(asTagId(VALID_UUID)).toBe(VALID_UUID)
  })

  it('отвергает не-UUID и враждебный ввод', () => {
    for (const bad of ['', 'not-a-uuid', "'; DROP TABLE notes--", '../../etc']) {
      expect(() => asNoteId(bad)).toThrow()
    }
  })
})
