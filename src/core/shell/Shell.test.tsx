import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { ModuleContract } from '@core/registry/moduleContract.ts'
import { defineModule } from '@core/registry/moduleContract.ts'
import { buildModuleList } from '@core/registry/moduleRegistry.ts'

import { Shell } from './Shell.tsx'

const Alpha = (): React.JSX.Element => <div>ALPHA_PAGE</div>
const Beta = (): React.JSX.Element => <div>BETA_PAGE</div>

const moduleA = defineModule({
  id: 'a',
  title: 'A',
  routes: [{ path: '/a', element: Alpha }],
  menu: { label: 'Меню-A', to: '/a', order: 20 },
})
const moduleB = defineModule({
  id: 'b',
  title: 'B',
  routes: [{ path: '/b', element: Beta }],
  menu: { label: 'Меню-B', to: '/b', order: 10 },
})

function render(path: string, modules: ModuleContract[]): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Shell modules={modules} />
    </MemoryRouter>,
  )
}

describe('Shell', () => {
  const modules = buildModuleList({
    a: { default: moduleA },
    b: { default: moduleB },
  })

  it('рендерит элемент активного маршрута и не рендерит чужой', () => {
    const html = render('/a', modules)
    expect(html).toContain('ALPHA_PAGE')
    expect(html).not.toContain('BETA_PAGE')
  })

  it('маршрут другого модуля рендерит свой элемент', () => {
    expect(render('/b', modules)).toContain('BETA_PAGE')
  })

  it('строит меню в порядке menu.order (без правок ядра)', () => {
    const html = render('/a', modules)
    expect(html).toContain('Меню-B')
    expect(html).toContain('Меню-A')
    expect(html.indexOf('Меню-B')).toBeLessThan(html.indexOf('Меню-A'))
  })

  it('провайдер модуля оборачивает дерево', () => {
    const withProvider = defineModule({
      id: 'p',
      title: 'P',
      routes: [{ path: '/p', element: (): React.JSX.Element => <div>P_PAGE</div> }],
      provider: ({ children }): React.JSX.Element => (
        <div data-prov="yes">{children}</div>
      ),
    })
    const html = render('/p', [withProvider])
    expect(html).toContain('data-prov="yes"')
    expect(html).toContain('P_PAGE')
  })
})

describe('Shell — fallback-маршрут', () => {
  it('несовпавший путь ведёт на NotFound', () => {
    const list = buildModuleList({ a: { default: moduleA } })
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <Shell modules={list} />
      </MemoryRouter>,
    )
    expect(html).toContain('Страница не найдена')
  })
})
