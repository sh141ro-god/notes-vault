import type { SyncItem } from './syncEngine.ts'
import type { SyncPullResult, SyncTarget } from './syncTarget.ts'

export interface HttpSyncTargetDeps {
  /** База API. Пусто = тот же origin (Cloudflare Pages Functions на /v1/*). */
  baseUrl?: string
  syncId: string
  authToken: string
  /** Для тестов; по умолчанию глобальный fetch. */
  fetchImpl?: typeof fetch
}

/**
 * HTTP-адаптер SyncTarget к Pages Functions (`/v1/pull`, `/v1/push`). Токен идёт
 * в заголовке Authorization; syncId — в теле. Тот же origin, поэтому CSP
 * `connect-src 'self'` работает без правок.
 */
export function createHttpSyncTarget(deps: HttpSyncTargetDeps): SyncTarget {
  const doFetch = deps.fetchImpl ?? fetch
  const base = deps.baseUrl ?? ''

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${deps.authToken}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Синхронизация ${path}: ошибка ${String(res.status)}`)
    }
    return (await res.json()) as T
  }

  return {
    pull(): Promise<SyncPullResult> {
      return post<SyncPullResult>('/v1/pull', { syncId: deps.syncId })
    },
    push(meta: string | null, items: SyncItem[]): Promise<{ applied: number }> {
      return post<{ applied: number }>('/v1/push', {
        syncId: deps.syncId,
        meta,
        items,
      })
    },
  }
}
