import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'

import type { ModuleContract } from '@core/registry/moduleContract.ts'
import { ThemeSwitcher } from '@core/styles/ThemeSwitcher.tsx'
import { Settings } from '@core/vault-ui/Settings.tsx'
import { useVaultStore } from '@core/vault-ui/VaultContext.ts'

import { ErrorBoundary } from './ErrorBoundary.tsx'
import './Shell.css'

interface ShellProps {
  /** Модули (уже отсортированы реестром по menu.order). */
  modules: ModuleContract[]
}

interface MenuItem {
  id: string
  label: string
  to: string
}

/** Порог, ниже которого включается мобильная оболочка (drawer + верхняя панель). */
const MOBILE_QUERY = '(max-width: 720px)'

function composeProviders(
  modules: ModuleContract[],
  children: ReactNode,
): ReactNode {
  return modules.reduceRight<ReactNode>((acc, module) => {
    const Provider = module.provider
    if (!Provider) {
      return acc
    }
    return <Provider>{acc}</Provider>
  }, children)
}

function NotFound(): React.JSX.Element {
  return (
    <div className="shell__message" role="alert">
      Страница не найдена.
    </div>
  )
}

function ModuleFailure(): React.JSX.Element {
  return (
    <div className="shell__message" role="alert">
      Не удалось загрузить раздел. Попробуйте перейти в другой раздел или
      перезагрузить приложение.
    </div>
  )
}

const LockIcon = (): React.JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

const MenuIcon = (): React.JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

const CloseIcon = (): React.JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** Живой индикатор сети (приложение работает в обоих режимах). */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = (): void => {
      setOnline(true)
    }
    const down = (): void => {
      setOnline(false)
    }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** Активен ли мобильный режим (реактивно на смену размера/поворот). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (): void => {
      setMobile(mql.matches)
    }
    onChange()
    mql.addEventListener('change', onChange)
    return () => {
      mql.removeEventListener('change', onChange)
    }
  }, [])
  return mobile
}

/**
 * Оболочка приложения (дизайн notes). На широком экране — статичный сайдбар с
 * навигацией-коллекциями. На телефоне (<=720px) тот же сайдбар превращается в
 * выезжающий drawer: открывается кнопкой-бургером в верхней панели, свайпом от
 * левого края или закрывается тапом по затемнению/ссылке. Всё оформление — в
 * CSS-классах (строгий CSP запрещает инлайн-стили); drawer управляется классом.
 */
export function Shell({ modules }: ShellProps): React.JSX.Element {
  const online = useOnline()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const store = useVaultStore()
  const [showSettings, setShowSettings] = useState(false)

  const menuItems: MenuItem[] = modules.flatMap((module) =>
    module.menu
      ? [{ id: module.id, label: module.menu.label, to: module.menu.to }]
      : [],
  )

  const hasIndexRoute = modules.some((module) =>
    module.routes.some((route) => route.path === '/'),
  )

  // Drawer имеет смысл только на телефоне: при переходе на десктоп — закрыть.
  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false)
    }
  }, [isMobile])

  // Свайп от левого края открывает drawer, свайп влево — закрывает. Активен
  // только в мобильном режиме. Порог по X больше, чем по Y (иначе конфликт со
  // скроллом). Состояние — через React, без инлайн-стилей (CSP-safe).
  useEffect(() => {
    if (!isMobile) {
      return
    }
    let startX = 0
    let startY = 0
    let startT = 0
    let tracking = false
    const onStart = (event: TouchEvent): void => {
      const point = event.touches[0]
      if (!point) {
        return
      }
      startX = point.clientX
      startY = point.clientY
      startT = Date.now()
      tracking = drawerOpen || startX < 28
    }
    const onEnd = (event: TouchEvent): void => {
      if (!tracking) {
        return
      }
      tracking = false
      const point = event.changedTouches[0]
      if (!point) {
        return
      }
      const dx = point.clientX - startX
      const dy = point.clientY - startY
      const dt = Date.now() - startT
      if (Math.abs(dx) < Math.abs(dy)) {
        return
      }
      if (!drawerOpen && dx > 48 && dt < 600) {
        setDrawerOpen(true)
      } else if (drawerOpen && dx < -40) {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [isMobile, drawerOpen])

  // Esc закрывает drawer.
  useEffect(() => {
    if (!drawerOpen) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  const closeDrawer = (): void => {
    setDrawerOpen(false)
  }

  const brand = (
    <div className="shell__brand">
      <span className="shell__logo mono">N</span>
      <span className="shell__wordmark mono">notes</span>
      <span
        className={`shell__net mono${online ? '' : ' shell__net--off'}`}
        title={online ? 'Онлайн' : 'Офлайн'}
      >
        <LockIcon />
        {online ? 'онлайн' : 'офлайн'}
      </span>
    </div>
  )

  const content = (
    <div className={`shell${drawerOpen ? ' shell--drawer-open' : ''}`}>
      {/* Мобильная верхняя панель (скрыта на десктопе через CSS). */}
      <header className="shell__topbar">
        <button
          type="button"
          className="shell__burger"
          aria-label="Открыть меню"
          aria-expanded={drawerOpen}
          onClick={() => {
            setDrawerOpen(true)
          }}
        >
          <MenuIcon />
        </button>
        <span className="shell__wordmark mono">notes</span>
        <span
          className={`shell__net mono${online ? '' : ' shell__net--off'}`}
          title={online ? 'Онлайн' : 'Офлайн'}
        >
          <LockIcon />
          {online ? 'онлайн' : 'офлайн'}
        </span>
      </header>

      {/* Затемнение под drawer (только мобайл). */}
      <div
        className="shell__scrim"
        data-open={drawerOpen}
        aria-hidden="true"
        onClick={closeDrawer}
      />

      <aside className={`shell__sidebar${drawerOpen ? ' shell__sidebar--open' : ''}`}>
        <div className="shell__sidebar-head">
          {brand}
          <button
            type="button"
            className="shell__drawer-close"
            aria-label="Закрыть меню"
            onClick={closeDrawer}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="label-mono shell__section">Коллекции</div>
        <nav className="shell__nav" aria-label="Основная навигация">
          {menuItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === '/'}
              onClick={closeDrawer}
              className={({ isActive }) =>
                `shell__link${isActive ? ' shell__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell__footer">
          <div className="shell__vault-actions">
            <button
              type="button"
              onClick={() => {
                closeDrawer()
                setShowSettings(true)
              }}
            >
              Настройки
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                closeDrawer()
                store.lock()
              }}
            >
              Заблокировать
            </button>
          </div>
          <ThemeSwitcher />
          <div className="shell__enc mono">
            <LockIcon />
            зашифровано · авто-лок 5м
          </div>
        </div>
      </aside>

      <main className="shell__main">
        <ErrorBoundary fallback={<ModuleFailure />}>
          <Routes>
            {modules.flatMap((module) =>
              module.routes.map((route) => {
                const Element = route.element
                return (
                  <Route
                    key={`${module.id}:${route.path}`}
                    path={route.path}
                    element={<Element />}
                  />
                )
              }),
            )}
            {!hasIndexRoute && menuItems[0] && (
              <Route
                path="/"
                element={<Navigate to={menuItems[0].to} replace />}
              />
            )}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )

  return (
    <>
      {composeProviders(modules, content)}
      {showSettings && (
        <div
          className="vault-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div className="vault-modal">
            <Settings
              onClose={() => {
                setShowSettings(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
