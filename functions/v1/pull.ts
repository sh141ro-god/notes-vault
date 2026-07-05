import { authorize, pull, type KvLike } from '../_lib/syncStore'

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

/** POST /v1/pull  { syncId }  → { meta, items } (доступ по Bearer-токену). */
export async function onRequestPost(context: Context): Promise<Response> {
  const token = bearer(context.request)
  let body: { syncId?: string }
  try {
    body = (await context.request.json()) as { syncId?: string }
  } catch {
    return json(400, { error: 'bad json' })
  }
  const syncId = body.syncId ?? ''
  if (!syncId || !token) {
    return json(400, { error: 'missing syncId or token' })
  }
  if (!(await authorize(context.env.SYNC_KV, syncId, token))) {
    return json(403, { error: 'forbidden' })
  }
  return json(200, await pull(context.env.SYNC_KV, syncId))
}
