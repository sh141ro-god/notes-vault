import { defineModule } from '@core/registry/moduleContract.ts'

import { CalendarPage } from './ui/CalendarPage.tsx'

/** Календарь: сетка месяца, раскраска прошедших дней, привязка задач ко дню. */
export default defineModule({
  id: 'calendar',
  title: 'Календарь',
  routes: [{ path: '/calendar', element: CalendarPage }],
  menu: { label: 'Календарь', to: '/calendar', order: 30 },
})
