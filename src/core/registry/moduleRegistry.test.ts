import { describe, expect, it } from 'vitest'

import { defineModule } from './moduleContract.ts'
import { buildModuleList } from './moduleRegistry.ts'

const Page = (): null => null

const modA = defineModule({
  id: 'a',
  title: 'A',
  routes: [{ path: '/a', element: Page }],
  menu: { label: 'A', to: '/a', order: 20 },
})
const modB = defineModule({
  id: 'b',
  title: 'B',
  routes: [{ path: '/b', element: Page }],
  menu: { label: 'B', to: '/b', order: 10 },
})
const modC = defineModule({
  id: 'c',
  title: 'C',
  routes: [{ path: '/c', element: Page }],
})

describe('buildModuleList', () => {
  it('сортирует по menu.order; модули без меню — в конце', () => {
    const list = buildModuleList({
      'x/module.config.ts': { default: modA },
      'y/module.config.ts': { default: modB },
      'z/module.config.ts': { default: modC },
    })
    expect(list.map((m) => m.id)).toEqual(['b', 'a', 'c'])
  })

  it('пустой набор → пустой список', () => {
    expect(buildModuleList({})).toEqual([])
  })
})
