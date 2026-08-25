import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
export type ThemeTransitionMode = 'immediate' | 'gradual'
export type ExtractionProgressStyle = 'bar' | 'sword' | 'minimal'
export type AccentColor = 'indigo' | 'forest' | 'ember' | 'rose'

export type ThemeSettings = {
  transitionEnabled: boolean
  transitionMode: ThemeTransitionMode
  durationMs: number
  extractionProgressStyle: ExtractionProgressStyle
  accent: AccentColor
}

const THEME_STORAGE_KEY = 'theme'
const THEME_ACCENT_STORAGE_KEY = 'theme-accent'
const THEME_SETTINGS_STORAGE_KEY = 'theme-settings'
const ACCENT_COLORS: AccentColor[] = ['indigo', 'forest', 'ember', 'rose']
const PROGRESS_STYLES: ExtractionProgressStyle[] = ['bar', 'sword', 'minimal']
const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  transitionEnabled: true,
  transitionMode: 'gradual',
  durationMs: 10000,
  extractionProgressStyle: 'bar',
  accent: 'indigo',
}
const MIN_DURATION_MS = 500
const MAX_DURATION_MS = 10000

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  themeSettings: ThemeSettings
  updateThemeSettings: (settings: Partial<ThemeSettings>) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function normalizeThemeSettings(value: Partial<ThemeSettings>): ThemeSettings {
  const durationMs = Number(value.durationMs)

  return {
    transitionEnabled: value.transitionEnabled !== false,
    transitionMode: value.transitionMode === 'immediate' ? 'immediate' : 'gradual',
    durationMs: Number.isFinite(durationMs)
      ? Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, durationMs))
      : DEFAULT_THEME_SETTINGS.durationMs,
    extractionProgressStyle: PROGRESS_STYLES.includes(value.extractionProgressStyle as ExtractionProgressStyle)
      ? (value.extractionProgressStyle as ExtractionProgressStyle)
      : 'bar',
    accent: ACCENT_COLORS.includes(value.accent as AccentColor)
      ? (value.accent as AccentColor)
      : 'indigo',
  }
}

function getInitialThemeSettings(): ThemeSettings {
  try {
    const storedSettings = window.localStorage.getItem(THEME_SETTINGS_STORAGE_KEY)
    if (!storedSettings) {
      return DEFAULT_THEME_SETTINGS
    }

    return normalizeThemeSettings(JSON.parse(storedSettings) as Partial<ThemeSettings>)
  } catch {
    return DEFAULT_THEME_SETTINGS
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getInitialThemeSettings)
  const transitionTimeoutRef = useRef<number | null>(null)

  const clearThemeTransition = useCallback(() => {
    const root = document.documentElement
    root.classList.remove('theme-transition')
    root.style.removeProperty('--theme-transition-duration')

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current)
      transitionTimeoutRef.current = null
    }
  }, [])

  const prepareThemeTransition = useCallback(() => {
    clearThemeTransition()

    if (
      !themeSettings.transitionEnabled ||
      themeSettings.transitionMode !== 'gradual' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const root = document.documentElement
    root.style.setProperty('--theme-transition-duration', `${themeSettings.durationMs}ms`)
    root.classList.add('theme-transition')
    transitionTimeoutRef.current = window.setTimeout(clearThemeTransition, themeSettings.durationMs)
  }, [clearThemeTransition, themeSettings])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState((currentTheme) => {
      if (currentTheme === nextTheme) {
        return currentTheme
      }

      prepareThemeTransition()
      return nextTheme
    })
  }, [prepareThemeTransition])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const updateThemeSettings = useCallback((updates: Partial<ThemeSettings>) => {
    setThemeSettings((currentSettings) => normalizeThemeSettings({ ...currentSettings, ...updates }))
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(themeSettings))
    window.localStorage.setItem(THEME_ACCENT_STORAGE_KEY, themeSettings.accent)
    document.documentElement.setAttribute('data-accent', themeSettings.accent)

    if (!themeSettings.transitionEnabled || themeSettings.transitionMode === 'immediate') {
      clearThemeTransition()
    }
  }, [clearThemeTransition, themeSettings])

  useEffect(() => clearThemeTransition, [clearThemeTransition])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, themeSettings, updateThemeSettings }}>
      {children}
    </ThemeContext.Provider>
  )
}
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
