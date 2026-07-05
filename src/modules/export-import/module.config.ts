import { defineModule } from '@core/registry/moduleContract.ts'

import { TransferScreen } from './ui/TransferScreen.tsx'

/** Модуль переноса волта файлом (реестр подхватывает автоматически). */
export default defineModule({
  id: 'export-import',
  title: 'Экспорт/Импорт',
  routes: [{ path: '/transfer', element: TransferScreen }],
  menu: { label: 'Экспорт/Импорт', to: '/transfer', order: 90 },
})
