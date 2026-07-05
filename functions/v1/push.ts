import { authorize, push, type KvLike, type SyncItem } from '../_lib/syncStore'

interface Env {
  SYNC_KV: KvLike
}
interface Context {
  request: Request
  env: Env
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

/** POST /v1/push  { syncId, meta?, items }  → { applied } (LWW-слияние на сервере). */
export async function onRequestPost(context: Context): Promise<Response> {
  const token = bearer(context.request)
  let body: { syncId?: string; meta?: string | null; items?: SyncItem[] }
  try {
    body = (await context.request.json()) as {
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
  if (!(await authorize(context.env.SYNC_KV, syncId, token))) {
    return json(403, { error: 'forbidden' })
  }
  const result = await push(context.env.SYNC_KV, syncId, body.meta, body.items)
  return json(200, result)
}
