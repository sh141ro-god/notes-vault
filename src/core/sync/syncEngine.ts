/**
 * Чистый движок слияния для синхронизации (без сети, без крипты, без IO) —
 * поэтому строго тестируем и одинаково работает на клиенте и (для проверки) на
 * сервере.
 *
 * Модель: элемент синхронизации — одна запись коллекции (заметка/задача/тег) в
 * виде ШИФРТЕКСТА + открытой метки времени `updatedAt` и флага `deleted`
 * (надгробие). Сервер и другие устройства видят только это — содержимое
 * зашифровано ключом волта и здесь не фигурирует.
 *
 * Слияние — last-write-wins по `updatedAt`. Ничьи разрешаются детерминированно
 * (одинаково на всех устройствах), чтобы синхронизация СХОДИЛАСЬ: после обмена и
 * локальная копия, и сервер приходят к одному набору `merged`.
 */

export interface SyncItem {
  collection: string
  id: string
  /** Момент последнего изменения записи (мс, из доменной сущности). */
  updatedAt: number
  /** Надгробие: запись удалена; `ct` при этом отсутствует. */
  deleted: boolean
  /** Сериализованный зашифрованный конверт (base64). Пусто для удалённых. */
  ct?: string
}

export interface MergeResult {
  /** Итоговый согласованный набор (к нему сходятся и клиент, и сервер). */
  merged: SyncItem[]
  /** Что записать/удалить локально (победил удалённый вариант). */
  applyLocal: SyncItem[]
  /** Что отправить на сервер (победил локальный вариант или сервер его не знал). */
  push: SyncItem[]
}

function keyOf(item: SyncItem): string {
  return `${item.collection}/${item.id}`
}

function ctOf(item: SyncItem): string {
  return item.ct ?? ''
}

/**
 * Победитель пары (детерминированный LWW):
 *   1) больше `updatedAt` — новее, побеждает;
 *   2) при равном времени надгробие (deleted) побеждает — удаление сходится;
 *   3) при прочем равенстве — лексикографически больший `ct` (устойчивый
 *      разрыв ничьей для настоящего конфликта одинакового времени).
 */
export function winner(a: SyncItem, b: SyncItem): SyncItem {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b
  }
  if (a.deleted !== b.deleted) {
    return a.deleted ? a : b
  }
  return ctOf(a) >= ctOf(b) ? a : b
}

/** Равны ли элементы по синхронизируемым полям (время + флаг + шифртекст). */
export function sameItem(a: SyncItem, b: SyncItem): boolean {
  return (
    a.updatedAt === b.updatedAt &&
    a.deleted === b.deleted &&
    ctOf(a) === ctOf(b)
  )
}

function toMap(items: SyncItem[]): Map<string, SyncItem> {
  const map = new Map<string, SyncItem>()
  for (const item of items) {
    const key = keyOf(item)
    const prev = map.get(key)
    // На случай дублей во входе — оставляем победителя.
    map.set(key, prev ? winner(prev, item) : item)
  }
  return map
}

/**
 * Двусторонний merge локального и удалённого наборов. Возвращает согласованный
 * `merged`, а также что применить локально и что отправить на сервер. Операция
 * идемпотентна: повторный merge уже согласованных наборов даёт пустые
 * applyLocal/push.
 */
export function mergeSync(local: SyncItem[], remote: SyncItem[]): MergeResult {
  const localMap = toMap(local)
  const remoteMap = toMap(remote)
  const keys = new Set<string>([...localMap.keys(), ...remoteMap.keys()])

  const merged: SyncItem[] = []
  const applyLocal: SyncItem[] = []
  const push: SyncItem[] = []

  for (const key of keys) {
    const l = localMap.get(key)
    const r = remoteMap.get(key)
    const w = l && r ? winner(l, r) : (l ?? r)
    if (!w) {
      continue
    }
    merged.push(w)
    if (!l || !sameItem(l, w)) {
      applyLocal.push(w)
    }
    if (!r || !sameItem(r, w)) {
      push.push(w)
    }
  }

  return { merged, applyLocal, push }
}
