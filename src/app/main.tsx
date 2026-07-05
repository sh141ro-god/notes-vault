import '@core/styles/theme.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { loadSodium } from '@core/crypto/sodium.ts'
import { initTheme } from '@core/styles/theme.ts'

import { App } from './App.tsx'
import { createContainer } from './di.ts'

// Применяем выбранную/системную тему до монтирования (без мигания).
initTheme()

/**
 * Защита от кликджекинга.
 *
 * Директива CSP `frame-ancestors` не действует при доставке через `<meta>`, а на
 * GitHub Pages нельзя выставить HTTP-заголовки. Поэтому отказываемся монтировать
 * приложение, если оно открыто во встроенном фрейме (экран ввода кодовой фразы —
 * привлекательная цель для overlay-обмана).
 */
function isFramed(): boolean {
  try {
    return window.top !== window.self
  } catch {
    // Доступ к window.top заблокирован → почти наверняка кросс-доменный фрейм.
    return true
  }
}

function renderMessage(message: string): void {
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.textContent = message
  }
}

/** Точка входа: инициализация крипты до монтирования дерева. */
async function bootstrap(): Promise<void> {
  const sodium = await loadSodium()
  const container = createContainer({ sodium })

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Не найден корневой элемент #root')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App container={container} />
    </StrictMode>,
  )
}

if (isFramed()) {
  renderMessage(
    'Открытие приложения во встроенном фрейме заблокировано в целях безопасности.',
  )
} else {
  bootstrap().catch((error: unknown) => {
    console.error('Не удалось инициализировать приложение:', error)
    renderMessage(
      'Не удалось инициализировать приложение. Обновите страницу или переустановите его.',
    )
  })
}
