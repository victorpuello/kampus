export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'auto'

const THEME_STORAGE_KEY = 'kampus:theme'

export function getStoredThemeMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' || value === 'auto' ? value : null
  } catch {
    return null
  }
}

export function resolveTheme(mode: ThemeMode, now: Date = new Date()): Theme {
  if (mode === 'light' || mode === 'dark') return mode
  // Auto: night = 18:00–05:59, day = 06:00–17:59
  const hour = now.getHours()
  const isNight = hour >= 18 || hour < 6
  return isNight ? 'dark' : 'light'
}

export function getInitialThemeMode(): ThemeMode {
  return getStoredThemeMode() ?? 'auto'
}

export function setStoredThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function applyTheme(theme: Theme) {
  const isDark = theme === 'dark'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function applyThemeMode(mode: ThemeMode, now: Date = new Date()): Theme {
  const resolved = resolveTheme(mode, now)
  applyTheme(resolved)
  return resolved
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  // Cycle: auto -> dark -> light -> auto
  const next: ThemeMode = current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto'
  setStoredThemeMode(next)
  applyThemeMode(next)
  return next
}
