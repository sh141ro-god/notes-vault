import { defineModule } from '@core/registry/moduleContract.ts'

import { HomePage } from './ui/HomePage.tsx'

/** Главная: индекс-маршрут '/'. Точка входа после разблокировки волта. */
export default defineModule({
  id: 'home',
  title: 'Главная',
  routes: [{ path: '/', element: HomePage }],
  menu: { label: 'Главная', to: '/', order: 0 },
})
