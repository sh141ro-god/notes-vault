/** Темы оформления (перенос дизайна notes). */
export type ThemeName = 'pastel' | 'dark' | 'mono'

export const THEME_ORDER: ThemeName[] = ['pastel', 'dark', 'mono']
export const THEME_LABEL: Record<ThemeName, string> = {
  pastel: 'Пастель',
  dark: 'Тёмная',
  mono: 'Светлая',
}

const KEY = 'notes-theme'

function isTheme(v: string | null): v is ThemeName {
  return v === 'pastel' || v === 'dark' || v === 'mono'
}

export function getStoredTheme(): ThemeName | null {
  try {
    const v = localStorage.getItem(KEY)
    return isTheme(v) ? v : null
  } catch {
    return null
  }
}

/** Тема по системной настройке: тёмная → dark, иначе светлая (mono). */
export function systemTheme(): ThemeName {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'mono'
  } catch {
    return 'dark'
  }
}

export function currentTheme(): ThemeName {
  return getStoredTheme() ?? systemTheme()
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* приватный режим — тема не сохранится, но применится */
  }
  applyTheme(theme)
}

/** Применить тему до монтирования (без мигания). */
export function initTheme(): void {
  applyTheme(currentTheme())
}
