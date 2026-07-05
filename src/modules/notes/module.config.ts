import { defineModule } from '@core/registry/moduleContract.ts'

import { NotesScreen } from './ui/NotesScreen.tsx'

/** Модуль заметок: мастер-детейл (список по тегам + просмотр/редактирование). */
export default defineModule({
  id: 'notes',
  title: 'Заметки',
  routes: [
    { path: '/notes', element: NotesScreen },
    { path: '/notes/:id', element: NotesScreen },
  ],
  menu: { label: 'Заметки', to: '/notes', order: 10 },
})
