import { describe, expect, it } from 'vitest'

import { mergeSync, sameItem, winner, type SyncItem } from './syncEngine.ts'

const item = (
  collection: string,
  id: string,
  updatedAt: number,
  ct?: string,
  deleted = false,
): SyncItem => ({ collection, id, updatedAt, deleted, ...(ct !== undefined ? { ct } : {}) })

describe('syncEngine.winner', () => {
  it('новее по updatedAt побеждает', () => {
    expect(winner(item('n', 'a', 2, 'X'), item('n', 'a', 1, 'Y')).ct).toBe('X')
  })
  it('при равном времени надгробие побеждает (удаление сходится)', () => {
    const del = item('n', 'a', 5, undefined, true)
    const live = item('n', 'a', 5, 'X')
    expect(winner(del, live).deleted).toBe(true)
    expect(winner(live, del).deleted).toBe(true)
  })
  it('конфликт равного времени разрешается детерминированно по ct', () => {
    const a = item('n', 'a', 5, 'AAA')
    const b = item('n', 'a', 5, 'BBB')
    expect(winner(a, b)).toBe(b)
    expect(winner(b, a)).toBe(b)
  })
})

describe('syncEngine.mergeSync', () => {
  it('локальная новее → в push, не в applyLocal', () => {
    const r = mergeSync([item('n', 'a', 3, 'NEW')], [item('n', 'a', 1, 'OLD')])
    expect(r.push).toHaveLength(1)
    expect(r.applyLocal).toHaveLength(0)
    expect(r.merged[0]?.ct).toBe('NEW')
  })
  it('удалённая новее → в applyLocal, не в push', () => {
    const r = mergeSync([item('n', 'a', 1, 'OLD')], [item('n', 'a', 3, 'NEW')])
    expect(r.applyLocal).toHaveLength(1)
    expect(r.push).toHaveLength(0)
  })
  it('только локальная → push; только удалённая → applyLocal', () => {
    const r = mergeSync([item('n', 'a', 1, 'L')], [item('n', 'b', 1, 'R')])
    expect(r.push.map((i) => i.id)).toEqual(['a'])
    expect(r.applyLocal.map((i) => i.id)).toEqual(['b'])
    expect(r.merged).toHaveLength(2)
  })
  it('удаление доезжает: надгробие на сервере применяется локально', () => {
    const r = mergeSync([item('n', 'a', 1, 'L')], [item('n', 'a', 2, undefined, true)])
    expect(r.applyLocal[0]?.deleted).toBe(true)
  })
  it('идемпотентность: согласованные наборы дают пустые применения', () => {
    const both = [item('n', 'a', 1, 'X'), item('t', 'b', 2, 'Y')]
    const r = mergeSync(both, both)
    expect(r.applyLocal).toHaveLength(0)
    expect(r.push).toHaveLength(0)
    expect(r.merged).toHaveLength(2)
  })
  it('сходимость: после merge merged одинаков независимо от направления', () => {
    const A = [item('n', 'a', 3, 'A3'), item('n', 'b', 1, 'B1')]
    const B = [item('n', 'a', 2, 'A2'), item('n', 'c', 5, 'C5', true)]
    const ab = mergeSync(A, B).merged
    const ba = mergeSync(B, A).merged
    const norm = (xs: SyncItem[]): string =>
      xs
        .map((i) => `${i.collection}/${i.id}:${String(i.updatedAt)}:${String(i.deleted)}:${i.ct ?? ''}`)
        .sort()
        .join('|')
    expect(norm(ab)).toBe(norm(ba))
  })
  it('дубликаты во входе схлопываются к победителю', () => {
    const r = mergeSync(
      [item('n', 'a', 1, 'OLD'), item('n', 'a', 9, 'NEW')],
      [],
    )
    expect(r.merged).toHaveLength(1)
    expect(r.merged[0]?.ct).toBe('NEW')
  })
  it('sameItem различает время/флаг/шифртекст', () => {
    expect(sameItem(item('n', 'a', 1, 'X'), item('n', 'a', 1, 'X'))).toBe(true)
    expect(sameItem(item('n', 'a', 1, 'X'), item('n', 'a', 2, 'X'))).toBe(false)
    expect(sameItem(item('n', 'a', 1, 'X'), item('n', 'a', 1, 'Y'))).toBe(false)
  })
})
