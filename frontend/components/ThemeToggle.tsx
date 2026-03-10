'use client'

import { Moon, Sun } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'

function getThemeSnapshot(): 'light' | 'dark' {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getThemeServerSnapshot(): 'dark' {
  return 'dark'
}

function subscribeToTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  window.addEventListener('storage', cb)
  return () => {
    mq.removeEventListener('change', cb)
    window.removeEventListener('storage', cb)
  }
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot)

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    // Force re-read by dispatching a storage event
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: newTheme }))
  }, [theme])

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors cursor-pointer"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      ) : (
        <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      )}
    </button>
  )
}
