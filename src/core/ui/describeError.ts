/**
 * Приводит произвольную ошибку к человекочитаемой строке для показа в UI.
 * Используется обработчиками действий, чтобы сбой операции не «глотался» молча.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  if (typeof error === 'string' && error !== '') {
    return error
  }
  return 'Не удалось выполнить операцию. Попробуйте ещё раз.'
}
