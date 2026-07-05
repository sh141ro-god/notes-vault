import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Изолирует сбой при рендере модуля: вместо падения всего приложения
 * показывает запасной UI. Навигация и остальная оболочка продолжают работать.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Сбой модуля в оболочке:', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
