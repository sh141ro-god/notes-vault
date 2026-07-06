import type { Envelope } from '@core/crypto/envelope.ts'
import type { KdfParams } from '@core/crypto/keyDerivation.ts'
import { z } from 'zod'

/**
 * zod-схемы для данных, читаемых с диска. IndexedDB — недоверенная граница:
 * содержимое могло быть повреждено или подменено, поэтому при чтении структура
 * валидируется. Криптографические инварианты (длина nonce и т.п.) проверяет слой
 * крипты при расшифровке; здесь — только форма.
 */

/**
 * Кросс-realm-устойчивая проверка Uint8Array: `instanceof` не срабатывает между
 * разными realm (например, структурированный клон из IndexedDB), поэтому
 * опираемся на внутренний тег объекта.
 */
const uint8ArraySchema = z.custom<Uint8Array>(
  (value) => Object.prototype.toString.call(value) === '[object Uint8Array]',
  { message: 'Ожидался Uint8Array' },
)

/** Структурная схема конверта (без криптопроверок). */
export const EnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('xchacha20poly1305'),
  nonce: uint8ArraySchema,
  ct: uint8ArraySchema,
})

/** Параметры KDF, хранятся открыто. */
export const KdfParamsSchema = z.object({
  alg: z.literal('argon2id'),
  opslimit: z.number().int().positive(),
  memlimit: z.number().int().positive(),
})

/** Открытая запись о волте (соли, параметры KDF, завёрнутые копии DEK). */
export const VaultMetaSchema = z.object({
  v: z.literal(1),
  kdf: KdfParamsSchema,
  /**
   * Параметры KDF для PIN-обёртки (SEC-01): PIN низкоэнтропийный, поэтому его
   * обёртка выводится с более дорогими параметрами, чем фраза. Отсутствует в
   * старых волтах — тогда используется общий `kdf`.
   */
  kdfPin: KdfParamsSchema.optional(),
  salts: z.object({
    pass: uint8ArraySchema,
    rec: uint8ArraySchema,
    pin: uint8ArraySchema.optional(),
  }),
  wrappedDek: z.object({
    pass: EnvelopeSchema,
    rec: EnvelopeSchema,
    pin: EnvelopeSchema.optional(),
  }),
  pinFailures: z.number().int().nonnegative(),
  createdAt: z.number().int(),
})

export type VaultMeta = z.infer<typeof VaultMetaSchema>

/**
 * Значение надгробия в сторе tombstones (ключ — [collection, id]).
 * Метаданные удаления (id, момент) открыты — как и прочие принятые моделью
 * угроз метаданные; содержимого у удалённой записи нет.
 */
export const TombstoneValueSchema = z.object({
  updatedAt: z.number().int().nonnegative(),
})

export type TombstoneValue = z.infer<typeof TombstoneValueSchema>

/**
 * Compile-time гарантия совместимости zod-схем с крипто-типами (CONN-01).
 * Форма Envelope/KdfParams описана и здесь (schema), и в crypto (type). Эти
 * проверки ломают сборку, если контракты разойдутся (например, в crypto
 * добавили поле, а схема его не валидирует). Рантайма не несут.
 */
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false

const _envelopeContractMatches: MutuallyAssignable<
  z.infer<typeof EnvelopeSchema>,
  Envelope
> = true
const _kdfParamsContractMatches: MutuallyAssignable<
  z.infer<typeof KdfParamsSchema>,
  KdfParams
> = true
void _envelopeContractMatches
void _kdfParamsContractMatches
