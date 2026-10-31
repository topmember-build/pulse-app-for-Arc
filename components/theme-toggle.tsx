'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark'

// Switches between the light and dark themes. The choice is saved in this browser only.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark')
  }, [])

  function toggle() {
    const next: Theme = document.documentElement.classList.contains('light') ? 'dark' : 'light'
    document.documentElement.className = next
    try { window.localStorage.setItem('pulse-theme', next) } catch { /* private mode: the choice just isn't saved */ }
    setTheme(next)
  }

  // Before the saved theme is known the button renders the same on server and client.
  const light = theme === 'light'
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={toggle} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} title={light ? 'Switch to dark mode' : 'Switch to light mode'}>
      {light ? <Moon /> : <Sun />}
    </Button>
  )
}
