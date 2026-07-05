import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary.tsx'

// Перехват ошибки рендера — гарантия React в браузере; renderToStaticMarkup
// (серверный путь) её не ловит, поэтому здесь проверяем логику состояния и
// happy-path, а реальный перехват верифицируется в браузере (M5).
describe('ErrorBoundary', () => {
  it('getDerivedStateFromError переводит в состояние ошибки', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true })
  })

  it('рендерит children, когда ошибки нет', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary fallback={<span>FB</span>}>
        <span>OK_CONTENT</span>
      </ErrorBoundary>,
    )
    expect(html).toContain('OK_CONTENT')
    expect(html).not.toContain('FB')
  })
})
