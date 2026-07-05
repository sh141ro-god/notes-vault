// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './markdown.ts'

describe('renderMarkdown — рендер и санитайзинг (XSS)', () => {
  it('рендерит базовый markdown', () => {
    const html = renderMarkdown('# Заголовок\n\n**жирный**')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>')
  })

  it('вырезает <script>', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script')
  })

  it('убирает inline-обработчики событий (onerror)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(html.toLowerCase()).not.toContain('onerror')
  })

  it('вырезает javascript:-ссылки', () => {
    const html = renderMarkdown('[клик](javascript:alert(1))')
    expect(html.toLowerCase()).not.toContain('javascript:')
  })
})

describe('renderMarkdown — поверхность CSS-инъекции', () => {
  it('вырезает инлайн-атрибут style', () => {
    const html = renderMarkdown('<div style="background:url(javascript:alert(1))">x</div>')
    expect(html.toLowerCase()).not.toContain('style=')
  })

  it('вырезает тег form', () => {
    const html = renderMarkdown('<form action="/x"><button>x</button></form>')
    expect(html.toLowerCase()).not.toContain('<form')
  })
})
