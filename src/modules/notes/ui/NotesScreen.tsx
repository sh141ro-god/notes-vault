import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'

import { createTagRepository } from '@core/tags/tagRepository.ts'
import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'
import type { ManifestEntry } from '@core/storage/manifest.ts'

import { createNote } from '../model.ts'
import { createNoteRepository } from '../noteRepository.ts'
import { NoteDetail } from './NoteDetail.tsx'
import '../notes.css'

interface TagInfo {
  name: string
  color: string
}

interface Group {
  key: string
  label: string
  notes: ManifestEntry[]
}

const UNTAGGED = '__untagged__'
const MOBILE_QUERY = '(max-width: 720px)'

/** Мобильный режим (безопасно к отсутствию matchMedia в jsdom-тестах). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (): void => {
      setMobile(mql.matches)
    }
    onChange()
    mql.addEventListener('change', onChange)
    return () => {
      mql.removeEventListener('change', onChange)
    }
  }, [])
  return mobile
}

export function NotesScreen(): React.JSX.Element {
  const services = useServices()
  const navigate = useNavigate()
  const { id } = useParams()
  const isMobile = useIsMobile()
  const repo = useMemo(() => createNoteRepository(services), [services])
  const tagRepo = useMemo(() => createTagRepository(services), [services])
  const [entries, setEntries] = useState<ManifestEntry[]>([])
  const [tagMap, setTagMap] = useState<Map<string, TagInfo>>(new Map())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)

  const noteOpen = id !== undefined
  // Мобильный режим: показываем ЛИБО список, ЛИБО заметку (два отдельных экрана).
  // Десктоп: мастер-детейл — оба столбца сразу.
  const showList = !isMobile || !noteOpen
  const showMain = !isMobile || noteOpen

  const loadIndex = useCallback(async (): Promise<ManifestEntry[]> => {
    const index = await repo.listIndex()
    if (index.length > 0 && index.some((e) => e.title === undefined)) {
      await repo.reindex()
      return repo.listIndex()
    }
    return index
  }, [repo])

  const reload = useCallback(async (): Promise<void> => {
    setEntries(await loadIndex())
  }, [loadIndex])

  useEffect(() => {
    let active = true
    Promise.all([loadIndex(), tagRepo.listAll()])
      .then(([index, tags]) => {
        if (active) {
          setEntries(index)
          setTagMap(new Map(tags.map((t) => [t.id, { name: t.name, color: t.color }])))
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(describeError(e))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [loadIndex, tagRepo])

  // Свайп вправо на экране заметки (мобильный) → назад к списку. Старт от самого
  // левого края (<30px) отдаём drawer'у оболочки, чтобы жесты не конфликтовали.
  useEffect(() => {
    const el = mainRef.current
    if (!isMobile || !noteOpen || !el) {
      return
    }
    let startX = 0
    let startY = 0
    let tracking = false
    const onStart = (event: TouchEvent): void => {
      const point = event.touches[0]
      if (!point) {
        return
      }
      startX = point.clientX
      startY = point.clientY
      tracking = startX >= 30
    }
    const onEnd = (event: TouchEvent): void => {
      if (!tracking) {
        return
      }
      tracking = false
      const point = event.changedTouches[0]
      if (!point) {
        return
      }
      const dx = point.clientX - startX
      const dy = point.clientY - startY
      if (dx > 60 && Math.abs(dx) > Math.abs(dy)) {
        void navigate('/notes')
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [isMobile, noteOpen, navigate])

  async function onCreate(): Promise<void> {
    setError(null)
    try {
      const note = createNote()
      await repo.save(note)
      await reload()
      void navigate(`/notes/${note.id}`)
    } catch (e) {
      setError(describeError(e))
    }
  }

  function toggle(key: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groups = useMemo<Group[]>(() => {
    const order: string[] = []
    const map = new Map<string, ManifestEntry[]>()
    for (const e of entries) {
      const key = e.tagIds?.[0] ?? UNTAGGED
      const arr = map.get(key)
      if (arr) arr.push(e)
      else {
        map.set(key, [e])
        order.push(key)
      }
    }
    return order.map((key) => ({
      key,
      label: key === UNTAGGED ? 'без тега' : (tagMap.get(key)?.name ?? '—'),
      notes: map.get(key) ?? [],
    }))
  }, [entries, tagMap])

  return (
    <div className={`nv${noteOpen ? ' nv--note-open' : ''}`}>
      {showList && (
        <div className="nv__list">
          <div className="nv__list-head">
            <span className="nv__list-title">Заметки</span>
            <span className="nv__list-count mono">{entries.length}</span>
            <button
              type="button"
              className="nv__add"
              title="Новая заметка"
              onClick={() => { void onCreate() }}
            >
              +
            </button>
          </div>
          <nav className="nv__nav">
            {loading ? (
              <p className="nv__muted">Загрузка…</p>
            ) : entries.length === 0 ? (
              <p className="nv__muted">Пока нет заметок.</p>
            ) : (
              groups.map((g) => {
                const open = !collapsed.has(g.key)
                return (
                  <div key={g.key} className="nv__group">
                    <button
                      type="button"
                      className="nv__group-btn mono"
                      onClick={() => { toggle(g.key) }}
                    >
                      <span className={`nv__caret${open ? ' nv__caret--open' : ''}`}>▸</span>
                      <span className="nv__group-label">#{g.label}</span>
                      <span className="nv__group-count">{g.notes.length}</span>
                    </button>
                    {open && (
                      <div className="nv__group-notes">
                        {g.notes.map((n) => (
                          <NavLink
                            key={n.id}
                            to={`/notes/${n.id}`}
                            className={({ isActive }) =>
                              `nv__note${isActive ? ' nv__note--active' : ''}`
                            }
                          >
                            {n.title !== undefined && n.title !== '' ? n.title : 'Без названия'}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </nav>
        </div>
      )}

      {showMain && (
        <div className="nv__main" ref={mainRef}>
          {error !== null && (
            <ErrorBanner message={error} onClose={() => { setError(null) }} />
          )}
          {id !== undefined ? (
            <NoteDetail
              key={id}
              id={id}
              repo={repo}
              tags={tagMap}
              onChanged={() => { void reload() }}
              onDeleted={() => {
                void reload()
                void navigate('/notes')
              }}
            />
          ) : (
            <div className="nv__placeholder">
              Выберите заметку слева или создайте новую.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
