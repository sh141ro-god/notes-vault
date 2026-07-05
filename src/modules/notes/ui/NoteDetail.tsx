import { useEffect, useState } from 'react'

import { TagPicker } from '@core/tags/ui/TagPicker.tsx'
import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'

import { renderMarkdown } from '../markdown.ts'
import type { Note } from '../model.ts'
import type { NoteRepository } from '../noteRepository.ts'

interface TagInfo {
  name: string
  color: string
}

interface NoteDetailProps {
  id: string
  repo: NoteRepository
  tags: Map<string, TagInfo>
  onChanged: () => void
  onDeleted: () => void
}

type LoadState = 'loading' | 'ready' | 'notfound'

function wordCount(body: string): number {
  const t = body.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)
}

export function NoteDetail({
  id,
  repo,
  tags,
  onChanged,
  onDeleted,
}: NoteDetailProps): React.JSX.Element {
  const [note, setNote] = useState<Note | undefined>(undefined)
  const [load, setLoad] = useState<LoadState>('loading')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoad('loading')
    setEditing(false)
    repo
      .get(id)
      .then((found) => {
        if (!active) return
        if (found) {
          const opened: Note = {
            ...found,
            lastOpenedAt: Date.now(),
            openCount: (found.openCount ?? 0) + 1,
          }
          setNote(opened)
          setLoad('ready')
          void repo.save(opened).catch(() => {
            /* отметка открытия не критична */
          })
        } else {
          setLoad('notfound')
        }
      })
      .catch(() => {
        if (active) setLoad('notfound')
      })
    return () => {
      active = false
    }
  }, [repo, id])

  async function onSave(current: Note): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const saved = { ...current, updatedAt: Date.now() }
      await repo.save(saved)
      setNote(saved)
      setEditing(false)
      onChanged()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(current: Note): Promise<void> {
    setError(null)
    try {
      await repo.remove(current.id)
      onDeleted()
    } catch (e) {
      setError(describeError(e))
    }
  }

  if (load === 'loading') {
    return <div className="nd__empty">Загрузка…</div>
  }
  if (load === 'notfound' || !note) {
    return <div className="nd__empty">Заметка не найдена.</div>
  }

  const current = note
  const firstTag = current.tagIds[0]
  const crumb = firstTag !== undefined ? tags.get(firstTag)?.name : undefined

  return (
    <section className="nd glass-card">
      <header className="nd__head">
        <div className="nd__crumbs mono">
          <span>Заметки</span>
          {crumb !== undefined && (
            <>
              <span className="nd__sep">/</span>
              <span>{crumb}</span>
            </>
          )}
          <span className="nd__saved mono">
            <span className="nd__saved-dot" />
            сохранено локально
          </span>
        </div>

        {editing ? (
          <input
            className="nd__title-input"
            placeholder="Заголовок"
            value={current.title}
            onChange={(event) => { setNote({ ...current, title: event.target.value }) }}
          />
        ) : (
          <h1 className="nd__title">
            {current.title !== '' ? current.title : 'Без названия'}
          </h1>
        )}

        {editing ? (
          <TagPicker
            selected={current.tagIds}
            onChange={(tagIds) => { setNote({ ...current, tagIds }) }}
          />
        ) : (
          current.tagIds.length > 0 && (
            <div className="nd__tags">
              {current.tagIds.map((tid) => {
                const info = tags.get(tid)
                return info ? (
                  <span
                    key={tid}
                    className="nd__tag mono"
                    style={{ color: info.color, borderColor: info.color }}
                  >
                    #{info.name}
                  </span>
                ) : null
              })}
            </div>
          )
        )}

        <div className="nd__meta mono">
          <span>{formatDate(current.updatedAt)}</span>
          <span className="nd__sep">·</span>
          <span>{wordCount(current.body)} слов</span>
          <span className="nd__sep">·</span>
          <span className="nd__md">md</span>
          <div className="nd__actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => { void onSave(current) }}
                >
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
                <button type="button" onClick={() => { setEditing(false) }}>
                  Отмена
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => { setEditing(true) }}>
                Редактировать
              </button>
            )}
            <button type="button" aria-label="Удалить" onClick={() => { void onDelete(current) }}>
              Удалить
            </button>
          </div>
        </div>
        <div className="nd__rule" />
      </header>

      {error !== null && (
        <div className="nd__padx">
          <ErrorBanner message={error} onClose={() => { setError(null) }} />
        </div>
      )}

      {editing ? (
        <textarea
          className="nd__textarea"
          placeholder="Текст в Markdown…"
          value={current.body}
          onChange={(event) => { setNote({ ...current, body: event.target.value }) }}
        />
      ) : (
        <article
          className="nd__article nt__article"
          // Содержимое уже санитизировано DOMPurify в renderMarkdown.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(current.body) }}
        />
      )}
    </section>
  )
}
