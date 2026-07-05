import {
  authorize,
  pull,
  push,
  type KvLike,
  type SyncItem,
} from '../functions/_lib/syncStore'

/**
 * Cloudflare Worker: раздаёт собранное приложение (assets) И обслуживает
 * синхронизацию (/v1/pull, /v1/push) поверх KV. Заменяет Pages Functions —
 * проект развёрнут как Worker со статическими ассетами (wrangler.jsonc).
 * Серверная логика переиспользуется из functions/_lib/syncStore (протестирована).
 */
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  SYNC_KV: KvLike
}

function bearer(request: Request): string {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function handlePull(request: Request, env: Env): Promise<Response> {
  const token = bearer(request)
  let body: { syncId?: string }
  try {
    body = (await request.json()) as { syncId?: string }
  } catch {
    return json(400, { error: 'bad json' })
  }
  const syncId = body.syncId ?? ''
  if (!syncId || !token) {
    return json(400, { error: 'missing syncId or token' })
  }
  if (!(await authorize(env.SYNC_KV, syncId, token))) {
    return json(403, { error: 'forbidden' })
  }
  return json(200, await pull(env.SYNC_KV, syncId))
}

async function handlePush(request: Request, env: Env): Promise<Response> {
  const token = bearer(request)
  let body: { syncId?: string; meta?: string | null; items?: SyncItem[] }
  try {
    body = (await request.json()) as {
      syncId?: string
      meta?: string | null
      items?: SyncItem[]
    }
  } catch {
    return json(400, { error: 'bad json' })
  }
  const syncId = body.syncId ?? ''
  if (!syncId || !token) {
    return json(400, { error: 'missing syncId or token' })
  }
  if (!Array.isArray(body.items)) {
    return json(400, { error: 'items must be an array' })
  }
  if (!(await authorize(env.SYNC_KV, syncId, token))) {
    return json(403, { error: 'forbidden' })
  }
  return json(200, await push(env.SYNC_KV, syncId, body.meta, body.items))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/v1/pull') {
      return handlePull(request, env)
    }
    if (request.method === 'POST' && url.pathname === '/v1/push') {
      return handlePush(request, env)
    }
    // Всё остальное — статические файлы приложения (SPA-фолбэк настроен в
    // wrangler.jsonc: not_found_handling = single-page-application).
    return env.ASSETS.fetch(request)
  },
}
