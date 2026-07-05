import { describe, expect, it } from 'vitest'

import type { Envelope } from '@core/crypto/envelope.ts'
import type { VaultMeta } from '@core/storage/schemas.ts'

import type { VaultExport } from './transportTarget.ts'
import {
  decodeVaultExport,
  encodeVaultExport,
  TransportError,
} from './vaultExportCodec.ts'

function env(fill: number): Envelope {
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: new Uint8Array(24).fill(fill),
    ct: new Uint8Array([fill, fill + 1, 200, 0, 255]),
  }
}

function meta(): VaultMeta {
  return {
    v: 1,
    kdf: { alg: 'argon2id', opslimit: 2, memlimit: 1 << 20 },
    salts: { pass: new Uint8Array(16).fill(1), rec: new Uint8Array(16).fill(2) },
    wrappedDek: { pass: env(3), rec: env(4) },
    pinFailures: 0,
    createdAt: 1_700_000_000_000,
  }
}

const NOTE_ID = '11111111-1111-4111-8111-111111111111'

function sampleExport(): VaultExport {
  return {
    magic: 'NOTESVAULT',
    v: 2,
    meta: meta(),
    collections: [
      { name: 'notes', manifest: env(7), blobs: [{ id: NOTE_ID, blob: env(9) }] },
    ],
  }
}

interface RawFile {
  magic: string
  meta: unknown
  collections: { name: string; manifest?: unknown; blobs: unknown[] }[]
}

describe('vaultExportCodec', () => {
  it('round-trip v2 сохраняет байты', () => {
    const restored = decodeVaultExport(encodeVaultExport(sampleExport()))
    expect([...restored.meta.salts.pass]).toEqual([...meta().salts.pass])
    expect(restored.collections[0]?.name).toBe('notes')
    expect([...(restored.collections[0]?.blobs[0]?.blob.ct ?? [])]).toEqual([
      ...env(9).ct,
    ])
    expect([...(restored.collections[0]?.manifest?.nonce ?? [])]).toEqual([
      ...env(7).nonce,
    ])
  })

  it('старый формат файла (v1) импортируется как коллекция notes', () => {
    const raw = JSON.parse(encodeVaultExport(sampleExport())) as RawFile
    const coll = raw.collections[0]
    const v1Text = JSON.stringify({
      magic: raw.magic,
      v: 1,
      meta: raw.meta,
      manifest: coll?.manifest,
      notes: coll?.blobs,
    })
    const restored = decodeVaultExport(v1Text)
    expect(restored.v).toBe(2)
    expect(restored.collections).toHaveLength(1)
    expect(restored.collections[0]?.name).toBe('notes')
    expect(restored.collections[0]?.blobs[0]?.id).toBe(NOTE_ID)
  })

  it('отвергает не-JSON', () => {
    expect(() => decodeVaultExport('не json')).toThrow(TransportError)
  })

  it('отвергает чужой magic', () => {
    expect(() =>
      decodeVaultExport(JSON.stringify({ magic: 'OTHER', v: 2 })),
    ).toThrow(TransportError)
  })

  it('отвергает неполный файл', () => {
    const raw = JSON.parse(encodeVaultExport(sampleExport())) as Record<
      string,
      unknown
    >
    delete raw.collections
    expect(() => decodeVaultExport(JSON.stringify(raw))).toThrow(TransportError)
  })
  it('отвергает недопустимое имя коллекции', () => {
    const raw = JSON.parse(encodeVaultExport(sampleExport())) as {
      collections: { name: string }[]
    }
    const coll = raw.collections[0]
    if (coll) {
      coll.name = 'Bad!'
    }
    expect(() => decodeVaultExport(JSON.stringify(raw))).toThrow(TransportError)
  })
})
