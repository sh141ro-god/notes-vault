import { describe, expect, it } from 'vitest'

import {
  authorize,
  pull,
  push,
  TOMBSTONE_TTL_SECONDS,
  version,
  type KvLike,
  type SyncItem,
} from './syncStore.ts'

/** In-memory KV, совместимый с интерфейсом Cloudflare KV (get/put/delete/list). */
function makeKv(): KvLike & {
  dump: () => Map<string, string>
  ttls: Map<string, number | undefined>
} {
  const map = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  return {
    dump: () => map,
    ttls,
    get: (k) => Promise.resolve(map.has(k) ? (map.get(k) as string) : null),
    put: (k, v, options) => {
      map.set(k, v)
      ttls.set(k, options?.expirationTtl)
      return Promise.resolve()
    },
    delete: (k) => {
      map.delete(k)
      return Promise.resolve()
    },
    list: ({ prefix }) => {
      const keys = [...map.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }))
      return Promise.resolve({ keys, list_complete: true })
    },
  }
}

const it0 = (id: string, updatedAt: number, ct?: string, deleted = false): SyncItem => ({
  collection: 'notes',
  id,
  updatedAt,
  deleted,
  ...(ct !== undefined ? { ct } : {}),
})

describe('syncStore.authorize (TOFU)', () => {
  it('первый токен запоминается, тот же проходит, другой — нет', async () => {
    const kv = makeKv()
    expect(await authorize(kv, 'BUCKET', 'tok-A')).toBe(true)
    expect(await authorize(kv, 'BUCKET', 'tok-A')).toBe(true)
    expect(await authorize(kv, 'BUCKET', 'tok-B')).toBe(false)
  })
  it('пустые значения отклоняются', async () => {
    const kv = makeKv()
    expect(await authorize(kv, '', 'tok')).toBe(false)
    expect(await authorize(kv, 'B', '')).toBe(false)
  })
  it('токен хранится хэшем, не в открытом виде', async () => {
    const kv = makeKv()
    await authorize(kv, 'BUCKET', 'secret-token')
    expect(kv.dump().get('BUCKET:auth')).not.toBe('secret-token')
  })
})

describe('syncStore.push/pull (LWW)', () => {
  it('push сохраняет, pull возвращает', async () => {
    const kv = makeKv()
    await push(kv, 'B', '{"meta":1}', [it0('a', 1, 'CT_A')])
    const got = await pull(kv, 'B')
    expect(got.meta).toBe('{"meta":1}')
    expect(got.items).toHaveLength(1)
    expect(got.items[0]?.ct).toBe('CT_A')
  })
  it('старый push не перезаписывает новый (LWW)', async () => {
    const kv = makeKv()
    await push(kv, 'B', null, [it0('a', 5, 'NEW')])
    const res = await push(kv, 'B', null, [it0('a', 2, 'OLD')])
    expect(res.applied).toBe(0)
    expect((await pull(kv, 'B')).items[0]?.ct).toBe('NEW')
  })
  it('новый push перезаписывает старый', async () => {
    const kv = makeKv()
    await push(kv, 'B', null, [it0('a', 2, 'OLD')])
    const res = await push(kv, 'B', null, [it0('a', 5, 'NEW')])
    expect(res.applied).toBe(1)
    expect((await pull(kv, 'B')).items[0]?.ct).toBe('NEW')
  })
  it('надгробие (deleted) сохраняется и отдаётся при pull', async () => {
    const kv = makeKv()
    await push(kv, 'B', null, [it0('a', 1, 'CT')])
    await push(kv, 'B', null, [it0('a', 2, undefined, true)])
    const items = (await pull(kv, 'B')).items
    expect(items[0]?.deleted).toBe(true)
    expect(items[0]?.ct).toBeUndefined()
  })
  it('надгробие пишется с TTL, живая запись — без (самопочинка при истечении)', async () => {
    const kv = makeKv()
    await push(kv, 'B', null, [it0('a', 1, 'CT')])
    expect(kv.ttls.get('B:item:notes/a')).toBeUndefined()
    await push(kv, 'B', null, [it0('a', 2, undefined, true)])
    expect(kv.ttls.get('B:item:notes/a')).toBe(TOMBSTONE_TTL_SECONDS)
    // Воскрешение более новой правкой снимает TTL.
    await push(kv, 'B', null, [it0('a', 3, 'BACK')])
    expect(kv.ttls.get('B:item:notes/a')).toBeUndefined()
  })

  it('версия: меняется при реальных изменениях, стабильна при пустых push', async () => {
    const kv = makeKv()
    expect(await version(kv, 'B')).toBeNull()

    const first = await push(kv, 'B', 'META', [it0('a', 1, 'CT')])
    expect(first.ver).not.toBeNull()
    expect(await version(kv, 'B')).toBe(first.ver)

    // Пустой push с той же meta — версия не дребезжит.
    const idle = await push(kv, 'B', 'META', [])
    expect(idle.ver).toBe(first.ver)

    // Проигравший LWW элемент ничего не меняет — версия та же.
    const losing = await push(kv, 'B', 'META', [it0('a', 0, 'OLD')])
    expect(losing.ver).toBe(first.ver)

    // Реальное изменение (и meta, и элемент) двигает версию.
    const bumped = await push(kv, 'B', 'META2', [it0('a', 2, 'NEW')])
    expect(bumped.ver).not.toBe(first.ver)
    expect((await pull(kv, 'B')).ver).toBe(bumped.ver)
  })

  it('корзины изолированы друг от друга', async () => {
    const kv = makeKv()
    await push(kv, 'B1', null, [it0('a', 1, 'ONE')])
    await push(kv, 'B2', null, [it0('a', 1, 'TWO')])
    expect((await pull(kv, 'B1')).items[0]?.ct).toBe('ONE')
    expect((await pull(kv, 'B2')).items[0]?.ct).toBe('TWO')
  })
})
