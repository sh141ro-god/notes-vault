import { defineModule } from '@core/registry/moduleContract.ts'

import { TaskEditor } from './ui/TaskEditor.tsx'
import { TasksList } from './ui/TasksList.tsx'

/** Модуль задач: одиночные цели и цепочки с привязкой к дню и тегами. */
export default defineModule({
  id: 'tasks',
  title: 'Задачи',
  routes: [
    { path: '/tasks', element: TasksList },
    { path: '/tasks/:id', element: TaskEditor },
  ],
  menu: { label: 'Задачи', to: '/tasks', order: 20 },
})
