import { useEffect, useMemo, useState } from 'react'

import { ErrorBanner } from '@core/ui/ErrorBanner.tsx'
import { describeError } from '@core/ui/describeError.ts'
import { useServices } from '@core/services/ServicesContext.ts'

import { createTag, type Tag } from '../tagModel.ts'
import { createTagRepository } from '../tagRepository.ts'
import './tagPicker.css'

interface TagPickerProps {
  /** Выбранные id тегов. */
  selected: string[]
  /** Вызывается с новым набором id при изменении выбора. */
  onChange: (tagIds: string[]) => void
}

/**
 * Переиспользуемый выбор тегов из центрального реестра (ядро). Читает полные
 * теги (нужны цвета), позволяет создать новый тег на месте. Имена тегов —
 * пользовательский контент, шифруются; здесь они лишь в памяти.
 */
export function TagPicker({ selected, onChange }: TagPickerProps): React.JSX.Element {
  const services = useServices()
  const repo = useMemo(() => createTagRepository(services), [services])
  const [tags, setTags] = useState<Tag[]>([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setTags(await repo.listAll())
  }

  useEffect(() => {
    let active = true
    repo
      .listAll()
      .then((list) => {
        if (active) {
          setTags(list)
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(describeError(e))
        }
      })
    return () => {
      active = false
    }
  }, [repo])

  function toggle(id: string): void {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    )
  }

  async function onCreate(): Promise<void> {
    const name = newName.trim()
    if (name === '') {
      return
    }
    setError(null)
    try {
      const tag = createTag(name)
      await repo.save(tag)
      setNewName('')
      await reload()
      onChange([...selected, tag.id])
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <div className="tagpicker">
      {error !== null && (
        <ErrorBanner
          message={error}
          onClose={() => {
            setError(null)
          }}
        />
      )}
      <div className="tagpicker__chips">
        {tags.length === 0 ? (
          <span className="tagpicker__empty">Тегов пока нет</span>
        ) : (
          tags.map((tag) => {
            const active = selected.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                className={`tagpicker__chip${active ? ' tagpicker__chip--on' : ''}`}
                style={{
                  borderColor: tag.color,
                  background: active ? tag.color : 'transparent',
                  color: active ? '#fff' : tag.color,
                }}
                aria-pressed={active}
                onClick={() => {
                  toggle(tag.id)
                }}
              >
                {tag.name}
              </button>
            )
          })
        )}
      </div>
      <form
        className="tagpicker__add"
        onSubmit={(event) => {
          event.preventDefault()
          void onCreate()
        }}
      >
        <input
          value={newName}
          placeholder="Новый тег"
          maxLength={64}
          onChange={(event) => {
            setNewName(event.target.value)
          }}
        />
        <button type="submit">+ тег</button>
      </form>
    </div>
  )
}
