/**
 * Серверная логика синхронизации для Cloudflare Pages Functions. Самодостаточна
 * (без импортов из src) — чтобы сборка Pages бандлила её без сюрпризов.
 *
 * Сервер — «тупое зашифрованное хранилище»: держит по «корзине» (syncId) набор
 * элементов { collection, id, updatedAt, deleted, ct } и открытую VaultMeta.
 * `ct` — зашифрованный ключом волта конверт (base64); сервер его не расшифровывает
 * и не может. LWW-слияние на push совпадает с клиентским движком, чтобы всё сходилось.
 */

export interface KvLike {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
  list(options: {
    prefix: string
    cursor?: string
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>
}

export interface SyncItem {
  collection: string
  id: string
  updatedAt: number
  deleted: boolean
  ct?: string
}

/**
 * TTL надгробий на сервере: 90 дней. Локальные надгробия устройств живут
 * бессрочно, поэтому даже после истечения серверного устройство, знавшее об
 * удалении, при следующем sync увидит «воскресшую» копию и повторно её удалит
 * (самопочинка). Живые записи хранятся без TTL.
 */
export const TOMBSTONE_TTL_SECONDS = 90 * 24 * 60 * 60

const textEncoder = new TextEncoder()

function ctOf(item: SyncItem): string {
  return item.ct ?? ''
}

/** LWW-победитель (идентично клиентскому syncEngine.winner). */
function winner(a: SyncItem, b: SyncItem): SyncItem {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b
  }
  if (a.deleted !== b.deleted) {
    return a.deleted ? a : b
  }
  return ctOf(a) >= ctOf(b) ? a : b
}

function sameItem(a: SyncItem, b: SyncItem): boolean {
  return a.updatedAt === b.updatedAt && a.deleted === b.deleted && ctOf(a) === ctOf(b)
}

async function sha256hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function authKey(syncId: string): string {
  return `${syncId}:auth`
}
function metaKey(syncId: string): string {
  return `${syncId}:meta`
}
function itemKey(syncId: string, collection: string, id: string): string {
  return `${syncId}:item:${collection}/${id}`
}

/**
 * Проверка доступа к корзине по токену (trust-on-first-use): на первый запрос
 * запоминаем хэш токена, дальше сверяем. Кто знает код синхронизации — знает и
 * токен, значит владеет корзиной.
 */
export async function authorize(
  kv: KvLike,
  syncId: string,
  authToken: string,
): Promise<boolean> {
  if (!syncId || !authToken) {
    return false
  }
  const presented = await sha256hex(authToken)
  const stored = await kv.get(authKey(syncId))
  if (stored === null) {
    await kv.put(authKey(syncId), presented)
    return true
  }
  return stored === presented
}

/** Полная выгрузка корзины: открытая VaultMeta + все элементы. */
export async function pull(
  kv: KvLike,
  syncId: string,
): Promise<{ meta: string | null; items: SyncItem[] }> {
  const meta = await kv.get(metaKey(syncId))
  const items: SyncItem[] = []
  const prefix = `${syncId}:item:`
  let cursor: string | undefined
  do {
    const page = await kv.list(cursor ? { prefix, cursor } : { prefix })
    for (const entry of page.keys) {
      const raw = await kv.get(entry.name)
      if (raw !== null) {
        items.push(JSON.parse(raw) as SyncItem)
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return { meta, items }
}

/**
 * Приём изменений: каждый элемент кладём только если он «побеждает» имеющийся
 * (LWW) — так параллельные пуши с разных устройств сходятся. Открытую VaultMeta,
 * если прислали, перезаписываем.
 */
export async function push(
  kv: KvLike,
  syncId: string,
  meta: string | null | undefined,
  items: SyncItem[],
): Promise<{ applied: number }> {
  let applied = 0
  for (const incoming of items) {
    const key = itemKey(syncId, incoming.collection, incoming.id)
    const existingRaw = await kv.get(key)
    if (existingRaw !== null) {
      const existing = JSON.parse(existingRaw) as SyncItem
      if (sameItem(existing, incoming) || winner(existing, incoming) === existing) {
        continue
      }
    }
    if (incoming.deleted) {
      await kv.put(key, JSON.stringify(incoming), {
        expirationTtl: TOMBSTONE_TTL_SECONDS,
      })
    } else {
      await kv.put(key, JSON.stringify(incoming))
    }
    applied += 1
  }
  if (meta !== undefined && meta !== null) {
    await kv.put(metaKey(syncId), meta)
  }
  return { applied }
}
