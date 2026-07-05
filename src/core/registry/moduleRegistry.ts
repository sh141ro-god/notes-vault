import type { ModuleContract } from './moduleContract.ts'

interface ModuleConfigModule {
  default: ModuleContract
}

/**
 * Чистая сборка списка модулей: достаёт дефолтные экспорты и сортирует по
 * `menu.order` (модули без меню — в конце). Вынесена отдельно от glob, чтобы
 * логику можно было тестировать без реальных файлов модулей.
 */
export function buildModuleList(
  configs: Record<string, ModuleConfigModule>,
): ModuleContract[] {
  return Object.values(configs)
    .map((module) => module.default)
    .sort((a, b) => (a.menu?.order ?? 999) - (b.menu?.order ?? 999))
}

/**
 * Build-time реестр: подхватывает все `modules/<name>/module.config.ts` через
 * `import.meta.glob`. Ядро НЕ импортирует модули по именам — только так.
 */
export function loadModules(): ModuleContract[] {
  const configs = import.meta.glob<ModuleConfigModule>(
    '/src/modules/*/module.config.ts',
    { eager: true },
  )
  return buildModuleList(configs)
}
