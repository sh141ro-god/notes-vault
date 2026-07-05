import { beforeAll, describe, expect, it } from 'vitest'

import type { CryptoService } from './cryptoService.ts'
import { loadSodium } from './sodium.ts'
import { createSodiumCryptoService } from './sodiumCryptoService.ts'

let crypto: CryptoService

beforeAll(async () => {
  crypto = createSodiumCryptoService(await loadSodium())
})

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('sodiumCryptoService', () => {
  it('round-trip шифр/дешифр (включая юникод и пустое сообщение)', () => {
    const key = crypto.randomKey()
    for (const msg of ['', 'hello', 'тайная заметка 🔐\n# заголовок']) {
      const env = crypto.encrypt(key, utf8(msg))
      const pt = crypto.decrypt(key, env)
      expect(new TextDecoder().decode(pt)).toBe(msg)
    }
  })

  it('подделанный тег/шифртекст → исключение', () => {
    const key = crypto.randomKey()
    const env = crypto.encrypt(key, utf8('секрет'))
    const tampered = { ...env, ct: Uint8Array.from(env.ct) }
    tampered.ct[0] = (tampered.ct[0] ?? 0) ^ 0xff
    expect(() => crypto.decrypt(key, tampered)).toThrow()
  })

  it('неверный ключ → исключение', () => {
    const env = crypto.encrypt(crypto.randomKey(), utf8('секрет'))
    expect(() => crypto.decrypt(crypto.randomKey(), env)).toThrow()
  })

  it('каждый encrypt даёт новый nonce и другой шифртекст', () => {
    const key = crypto.randomKey()
    const a = crypto.encrypt(key, utf8('одно и то же'))
    const b = crypto.encrypt(key, utf8('одно и то же'))
    expect([...a.nonce]).not.toEqual([...b.nonce])
    expect([...a.ct]).not.toEqual([...b.ct])
  })

  it('randomKey возвращает 32 байта, randomBytes — заданную длину', () => {
    expect(crypto.randomKey().length).toBe(32)
    expect(crypto.randomBytes(16).length).toBe(16)
    expect(() => crypto.randomBytes(-1)).toThrow()
  })

  it('decrypt отвергает ключ неверной длины', () => {
    const env = crypto.encrypt(crypto.randomKey(), utf8('x'))
    expect(() => crypto.decrypt(new Uint8Array(8), env)).toThrow()
  })
})

describe('sodiumCryptoService — wipe', () => {
  it('обнуляет байты на месте', () => {
    const secret = crypto.randomBytes(32)
    expect(secret.some((b) => b !== 0)).toBe(true)
    crypto.wipe(secret)
    expect(secret.every((b) => b === 0)).toBe(true)
  })
})
