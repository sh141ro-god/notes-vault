import DOMPurify from 'dompurify'
import { marked } from 'marked'

/** Запрещённые теги/атрибуты сверх дефолта DOMPurify (поверхность CSS-инъекции). */
const SANITIZE_CONFIG = {
  FORBID_TAGS: ['form', 'style'],
  FORBID_ATTR: ['style'],
}

/**
 * Рендерит markdown заметки в БЕЗОПАСНЫЙ HTML. Содержимое заметки недоверенное
 * (может прийти из импорта/синхронизации), поэтому результат marked обязательно
 * пропускается через DOMPurify. Дополнительно запрещены инлайн-`style` и `<form>`
 * — это убирает поверхность CSS-инъекции/UI-redress (XSS-исполнение DOMPurify
 * вырезает и так).
 */
export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false })
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG)
}
