import sodium from 'libsodium-wrappers-sumo'

/**
 * Единая точка входа для libsodium во всём приложении.
 *
 * Здесь локализован обход сломанной ESM-упаковки `libsodium-wrappers-sumo`
 * (см. alias в `vite.config.ts`). Если upstream починит пакет или сменится
 * мажорная версия — правка нужна только в этом файле и в alias, а не по всему
 * коду. Версия пакета запинена точно в package.json по той же причине.
 */
export type Sodium = typeof sodium

/** Дожидается готовности WASM-модуля и возвращает инициализированный экземпляр. */
export async function loadSodium(): Promise<Sodium> {
  await sodium.ready
  return sodium
}
