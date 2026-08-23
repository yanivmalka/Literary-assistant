import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const labelKey = theme === 'dark' ? 'ui.theme.switchToLight' : 'ui.theme.switchToDark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={t(labelKey)}
      title={t(labelKey)}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{t(labelKey)}</span>
    </button>
  )
}
