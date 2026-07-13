import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { ModuleContract } from '@core/registry/moduleContract.ts'
import { defineModule } from '@core/registry/moduleContract.ts'
import { buildModuleList } from '@core/registry/moduleRegistry.ts'

import { VaultStoreProvider } from '@core/vault-ui/VaultContext.ts'
import type { VaultStore } from '@core/vault-ui/vaultStore.ts'

import { Shell } from './Shell.tsx'

const fakeStore = {
  subscribe: () => () => undefined,
  getSnapshot: () => ({
    status: 'unlocked',
    pinAvailable: false,
    pendingRecoveryCode: undefined,
  }),
  initialize: () => Promise.resolve(),
  setup: () => Promise.resolve(),
  acknowledgeRecovery: () => undefined,
  unlockWithPassphrase: () => Promise.resolve(),
  unlockWithPin: () => Promise.resolve(),
  unlockWithRecovery: () => Promise.resolve(),
  enablePin: () => Promise.resolve(),
  changePassphrase: () => Promise.resolve(),
  regenerateRecoveryCode: () => Promise.resolve(),
  lock: () => undefined,
} as unknown as VaultStore

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
      <VaultStoreProvider value={fakeStore}>
        <Shell modules={modules} />
      </VaultStoreProvider>
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
        <VaultStoreProvider value={fakeStore}>
          <Shell modules={list} />
        </VaultStoreProvider>
      </MemoryRouter>,
      )
    expect(html).toContain('Страница не найдена')
  })
})
