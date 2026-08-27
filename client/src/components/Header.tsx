import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Feather, Map, LogOut, Trash2, FolderOpen, Settings, Menu, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useQuillStore } from '@/stores/quillStore'
import { toast } from './Toast'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, signOut } = useAuthStore()
  const { wallet, loadWallet, clear } = useQuillStore()
  const previousBalance = useRef<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (user) {
      loadWallet()
    } else {
      clear()
    }
  }, [clear, loadWallet, user])

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user || !wallet) return

    const currentBalance = wallet.quills_balance
    const storageKey = `quills:last-seen:${user.id}`
    const storedBalance = Number(window.localStorage.getItem(storageKey))
    const previous = previousBalance.current ?? (Number.isFinite(storedBalance) ? storedBalance : null)

    if (previous !== null) {
      if (previous > 10 && currentBalance <= 10) {
        toast('info', t('quills.warning10'))
      }
      if (previous > 5 && currentBalance <= 5) {
        toast('info', t('quills.warning5'))
      }
      if (previous > 3 && currentBalance <= 3 && location.pathname !== '/quills') {
        navigate('/quills')
      }
    }

    previousBalance.current = currentBalance
    window.localStorage.setItem(storageKey, String(currentBalance))
  }, [location.pathname, navigate, t, user, wallet])

  const handleSignOut = async () => {
    setMobileMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  const isActive = (prefix: string) => location.pathname.startsWith(prefix)

  return (
    <header className="relative border-b bg-card px-4 sm:px-6 lg:px-10 xl:px-[2cm] py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-6 xl:gap-9 min-w-0">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
            <Map className="h-4 w-4 text-primary-foreground" />
          </span>
          <h1 className="font-display text-base sm:text-lg font-semibold tracking-tight truncate">{t('app.title')}</h1>
        </Link>

        {user && (
          <nav className="hidden lg:flex items-center gap-1">
            <Link
              to="/projects"
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                isActive('/projects')
                  ? 'text-primary bg-primary-soft'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <FolderOpen className="h-4 w-4" />
              {t('projects.title')}
            </Link>
            <Link
              to="/trash"
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                isActive('/trash')
                  ? 'text-primary bg-primary-soft'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Trash2 className="h-4 w-4" />
              {t('projects.trash')}
            </Link>
            <Link
              to="/quills"
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-soft transition-colors"
              aria-label={t('quills.openStore')}
            >
              <Feather className="h-4 w-4" />
              <span>{wallet?.quills_balance ?? '—'} {t('quills.namePlural')}</span>
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <ThemeToggle />
        <LanguageSwitcher />

        {user && (
          <>
            {/* Desktop account controls */}
            <div className="hidden lg:flex items-center gap-3">
              <span className="text-sm text-muted-foreground max-w-[12rem] truncate">
                {profile?.display_name || user.email}
              </span>
              <Link
                to="/account-settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={t('ui.account.settings')}
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">{t('ui.account.settings')}</span>
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={t('auth.logout')}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">{t('auth.logout')}</span>
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(open => !open)}
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={mobileMenuOpen ? t('common.close') : t('nav.menu')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </>
        )}
      </div>

      {/* Mobile drawer */}
      {user && mobileMenuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 top-0 z-30 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav className="lg:hidden absolute inset-x-0 top-full z-40 border-b border-border bg-card shadow-lg p-3 flex flex-col gap-1">
            <Link
              to="/projects"
              className={`flex items-center gap-2 rounded-md px-3 min-h-11 text-sm font-semibold transition-colors ${
                isActive('/projects')
                  ? 'text-primary bg-primary-soft'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              {t('projects.title')}
            </Link>
            <Link
              to="/trash"
              className={`flex items-center gap-2 rounded-md px-3 min-h-11 text-sm font-semibold transition-colors ${
                isActive('/trash')
                  ? 'text-primary bg-primary-soft'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              {t('projects.trash')}
            </Link>
            <Link
              to="/quills"
              className="flex items-center gap-2 rounded-md px-3 min-h-11 text-sm font-semibold text-primary hover:bg-primary-soft transition-colors"
            >
              <Feather className="h-4 w-4 shrink-0" />
              <span>{wallet?.quills_balance ?? '—'} {t('quills.namePlural')}</span>
            </Link>

            <div className="my-1 border-t border-border" />

            <span className="px-3 py-1 text-xs text-muted-foreground truncate">
              {profile?.display_name || user.email}
            </span>
            <Link
              to="/account-settings"
              className="flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4 shrink-0" />
              {t('ui.account.settings')}
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-start text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {t('auth.logout')}
            </button>
          </nav>
        </>
      )}
    </header>
  )
}
