import { useState } from 'react'

import {
  currentTheme,
  setTheme,
  THEME_LABEL,
  THEME_ORDER,
  type ThemeName,
} from './theme.ts'
import './themeSwitcher.css'

/** Три кружка-сватча для выбора темы (как в макете). */
export function ThemeSwitcher(): React.JSX.Element {
  const [theme, setLocal] = useState<ThemeName>(currentTheme)

  function pick(next: ThemeName): void {
    setTheme(next)
    setLocal(next)
  }

  return (
    <div className="theme-switch">
      <span className="label-mono theme-switch__label">Тема</span>
      {THEME_ORDER.map((name) => (
        <button
          key={name}
          type="button"
          title={THEME_LABEL[name]}
          aria-label={`Тема: ${THEME_LABEL[name]}`}
          aria-pressed={theme === name}
          className={`theme-switch__dot theme-switch__dot--${name}${
            theme === name ? ' theme-switch__dot--on' : ''
          }`}
        onClick={() => {
            pick(name)
          }}
        />
      ))}
    </div>
  )
}
