import { BrowserRouter } from 'react-router'

import type { ModuleContract } from '@core/registry/moduleContract.ts'

import { Shell } from './Shell.tsx'

interface AppShellProps {
  modules: ModuleContract[]
}

/**
 * Прод-оболочка: оборачивает Shell в BrowserRouter с basename из `BASE_URL`
 * (приложение раздаётся из подпапки на GitHub Pages).
 */
export function AppShell({ modules }: AppShellProps): React.JSX.Element {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell modules={modules} />
    </BrowserRouter>
  )
}
