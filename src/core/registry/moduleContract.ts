import type { ComponentType, FC, ReactNode } from 'react'

/** Один маршрут модуля. */
export interface ModuleRoute {
  path: string
  element: ComponentType
}

/** Пункт меню модуля. */
export interface ModuleMenu {
  label: string
  to: string
  /** Порядок в меню (меньше — выше). По умолчанию в конце. */
  order?: number
}

/** Команда модуля (для будущей командной палитры). */
export interface ModuleCommand {
  id: string
  title: string
  run: () => void
}

/**
 * Контракт модуля-фичи. Ядро знает только этот контракт; чтобы добавить модуль,
 * создаётся `modules/<name>/module.config.ts` с дефолтным экспортом, а реестр
 * (`import.meta.glob`) подхватывает его без правок ядра.
 */
export interface ModuleContract {
  id: string
  title: string
  icon?: ComponentType
  routes: ModuleRoute[]
  menu?: ModuleMenu
  commands?: ModuleCommand[]
  /** Глобальный провайдер, оборачивающий дерево приложения. */
  provider?: FC<{ children: ReactNode }>
}

/** Типобезопасный хелпер описания модуля (identity). */
export function defineModule(contract: ModuleContract): ModuleContract {
  return contract
}
