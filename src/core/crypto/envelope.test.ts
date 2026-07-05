import { describe, expect, it } from 'vitest'

import {
  deserializeEnvelope,
  ENVELOPE_VERSION,
  serializeEnvelope,
  XCHACHA20POLY1305_NONCE_BYTES,
  type Envelope,
} from './envelope.ts'

function makeEnvelope(): Envelope {
  return {
    v: ENVELOPE_VERSION,
    alg: 'xchacha20poly1305',
    nonce: new Uint8Array(XCHACHA20POLY1305_NONCE_BYTES).fill(7),
    ct: new Uint8Array([1, 2, 3, 4, 5]),
  }
}

describe('envelope', () => {
  it('round-trip сериализации', () => {
    const env = makeEnvelope()
    const restored = deserializeEnvelope(serializeEnvelope(env))
    expect(restored.v).toBe(ENVELOPE_VERSION)
    expect(restored.alg).toBe('xchacha20poly1305')
    expect([...restored.nonce]).toEqual([...env.nonce])
    expect([...restored.ct]).toEqual([...env.ct])
  })

  it('отвергает слишком короткие данные', () => {
    expect(() => deserializeEnvelope(new Uint8Array([1, 1, 0]))).toThrow()
  })

  it('отвергает неизвестную версию', () => {
    const bytes = serializeEnvelope(makeEnvelope())
    bytes[0] = 9
    expect(() => deserializeEnvelope(bytes)).toThrow()
  })

  it('отвергает неизвестный алгоритм', () => {
    const bytes = serializeEnvelope(makeEnvelope())
    bytes[1] = 9
    expect(() => deserializeEnvelope(bytes)).toThrow()
  })

  it('отвергает конверт с неверной длиной nonce', () => {
    const bad: Envelope = {
      v: ENVELOPE_VERSION,
      alg: 'xchacha20poly1305',
      nonce: new Uint8Array(8),
      ct: new Uint8Array(16),
    }
    expect(() => serializeEnvelope(bad)).toThrow()
  })
})
