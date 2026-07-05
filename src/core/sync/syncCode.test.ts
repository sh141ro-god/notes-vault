import { beforeAll, describe, expect, it } from 'vitest'

import { loadSodium } from '@core/crypto/sodium.ts'
import type { Sodium } from '@core/crypto/sodium.ts'

import {
  deriveSyncIdentity,
  generateSyncCode,
  normalizeSyncCode,
} from './syncCode.ts'

let sodium: Sodium

beforeAll(async () => {
  sodium = await loadSodium()
})

describe('syncCode', () => {
  it('генерирует код, нормализация убирает дефисы/регистр', () => {
    const code = generateSyncCode(sodium)
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/)
    expect(normalizeSyncCode(code)).toBe(code.replace(/-/g, ''))
    expect(normalizeSyncCode(code.toLowerCase())).toBe(normalizeSyncCode(code))
  })

  it('идентичность детерминирована и не зависит от регистра/дефисов', () => {
    const code = generateSyncCode(sodium)
    const a = deriveSyncIdentity(sodium, code)
    const b = deriveSyncIdentity(sodium, code.toLowerCase().replace(/-/g, ' '))
    expect(a).toEqual(b)
  })

  it('syncId и authToken различны', () => {
    const id = deriveSyncIdentity(sodium, generateSyncCode(sodium))
    expect(id.syncId).not.toBe(id.authToken)
    expect(id.syncId.length).toBeGreaterThan(20)
  })

  it('разные коды → разные корзины', () => {
    const a = deriveSyncIdentity(sodium, generateSyncCode(sodium))
    const b = deriveSyncIdentity(sodium, generateSyncCode(sodium))
    expect(a.syncId).not.toBe(b.syncId)
  })

  it('слишком короткий код отвергается', () => {
    expect(() => deriveSyncIdentity(sodium, 'ABC-123')).toThrow()
  })
})
