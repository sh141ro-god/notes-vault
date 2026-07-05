import { assertCollection, type Repository } from '@core/storage/repository.ts'
import {
  type CollectionSnapshot,
  VAULT_EXPORT_MAGIC,
  VAULT_EXPORT_VERSION,
  type VaultExport,
} from '@core/transport/transportTarget.ts'
import { TransportError } from '@core/transport/vaultExportCodec.ts'

export interface BuildExportOptions {
  /**
   * Оставить PIN-обёртку в снимке. По умолчанию false: пользовательский файл
   * переноса PIN не содержит (SEC-01). true используется только для внутреннего
   * бэкапа при импорте — там нужен полный слепок текущего волта для отката.
   */
  keepPin?: boolean
}

/**
 * Собирает снимок ВСЕХ коллекций волта из хранилища. Работает на уровне
 * шифртекста и открытой VaultMeta — DEK не нужен (экспорт возможен без разблокировки).
 */
export async function buildVaultExport(
  repository: Repository,
  options: BuildExportOptions = {},
): Promise<VaultExport> {
  const stored = await repository.readVaultMeta()
  if (!stored) {
    throw new TransportError('Нет волта для экспорта')
  }
  // SEC-01: PIN-обёртка — удобство конкретного устройства и слабое звено
  // (низкоэнтропийный PIN перебирается офлайн). В переносимый файл она не
  // попадает; на новом устройстве PIN настраивается заново.
  let meta = stored
  if (!options.keepPin) {
    meta = {
      ...stored,
      salts: { pass: stored.salts.pass, rec: stored.salts.rec },
      wrappedDek: { pass: stored.wrappedDek.pass, rec: stored.wrappedDek.rec },
    }
    delete meta.kdfPin
  }
  const collections: CollectionSnapshot[] = []
  for (const name of await repository.listCollections()) {
    const manifest = await repository.getManifest(name)
    const blobs: CollectionSnapshot['blobs'] = []
    for (const id of await repository.listBlobIds(name)) {
      const blob = await repository.getBlob(name, id)
      if (blob) {
        blobs.push({ id, blob })
      }
    }
    collections.push({ name, ...(manifest ? { manifest } : {}), blobs })
  }
  return { magic: VAULT_EXPORT_MAGIC, v: VAULT_EXPORT_VERSION, meta, collections }
}

/**
 * Применяет снимок ОДНОЙ атомарной транзакцией (DATA-01): либо весь волт заменён,
 * либо не изменён ничего. Крах посреди импорта больше не оставляет полустёртый волт.
 */
async function applySnapshot(
  repository: Repository,
  snapshot: VaultExport,
): Promise<void> {
  await repository.replaceAll({
    meta: snapshot.meta,
    collections: snapshot.collections.map((collection) => ({
      name: collection.name,
      ...(collection.manifest ? { manifest: collection.manifest } : {}),
      blobs: collection.blobs,
    })),
  })
}

/**
 * Транзакционно восстанавливает волт из снимка:
 *   1) валидирует имена коллекций ДО любой разрушительной операции (RESTORE-01);
 *   2) делает снимок текущего волта для отката;
 *   3) применяет импорт; при сбое откатывается к исходному состоянию (RESTORE-02).
 *
 * После успешного импорта волт нужно разблокировать кодовой фразой из файла.
 */
export async function restoreVaultExport(
  repository: Repository,
  data: VaultExport,
): Promise<void> {
  // 1. Валидация до разрушительных операций — битый/чужой снимок не должен
  //    стирать текущие данные.
  for (const collection of data.collections) {
    assertCollection(collection.name)
  }

  // 2. Снимок текущего волта (если он есть) — для отката. keepPin: бэкап должен
  //    быть полным слепком, включая PIN-обёртку.
  const hasCurrent = (await repository.readVaultMeta()) !== undefined
  const backup = hasCurrent
    ? await buildVaultExport(repository, { keepPin: true })
    : undefined

  // 3. Применяем; при ошибке откатываем к исходному состоянию.
  try {
    await applySnapshot(repository, data)
  } catch (error) {
    if (backup) {
      await applySnapshot(repository, backup)
    }
    throw error
  }
}
