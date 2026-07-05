import { beforeAll, describe, expect, it } from 'vitest'

import type { KdfParams, KeyDerivation } from './keyDerivation.ts'
import { ARGON2ID_SALT_BYTES } from './keyDerivation.ts'
import { loadSodium } from './sodium.ts'
import {
  createSodiumKeyDerivation,
  recommendedKdfParams,
} from './sodiumKeyDerivation.ts'

let kdfService: KeyDerivation
let params: KdfParams

beforeAll(async () => {
  const sodium = await loadSodium()
  kdfService = createSodiumKeyDerivation(sodium)
  params = recommendedKdfParams(sodium)
})

const salt = (fill: number): Uint8Array =>
  new Uint8Array(ARGON2ID_SALT_BYTES).fill(fill)

describe('sodiumKeyDerivation', () => {
  it('deriveWrapKey детерминирован при одинаковых секрете, соли и параметрах', async () => {
    const a = await kdfService.deriveWrapKey('correct horse battery', salt(1), params)
    const b = await kdfService.deriveWrapKey('correct horse battery', salt(1), params)
    expect(a.length).toBe(32)
    expect([...a]).toEqual([...b])
  })

  it('разная соль → другой ключ', async () => {
    const a = await kdfService.deriveWrapKey('phrase', salt(1), params)
    const b = await kdfService.deriveWrapKey('phrase', salt(2), params)
    expect([...a]).not.toEqual([...b])
  })

  it('разный секрет → другой ключ', async () => {
    const a = await kdfService.deriveWrapKey('phrase-1', salt(1), params)
    const b = await kdfService.deriveWrapKey('phrase-2', salt(1), params)
    expect([...a]).not.toEqual([...b])
  })

  it('отвергает соль неверной длины', async () => {
    await expect(
      kdfService.deriveWrapKey('phrase', new Uint8Array(8), params),
    ).rejects.toThrow()
  })

  it('recovery-код: формат, заявленная энтропия (160 бит = 32 base32-символа)', () => {
    const code = kdfService.generateRecoveryCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){7}$/)
    expect(code.replace(/-/g, '')).toHaveLength(32)
  })

  it('recovery-коды уникальны (нет коллизий на выборке)', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 500; i += 1) {
      codes.add(kdfService.generateRecoveryCode())
    }
    expect(codes.size).toBe(500)
  })
})
