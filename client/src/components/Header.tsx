import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Feather, Map, LogOut, Trash2, FolderOpen, Settings } from 'lucide-react'
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

  useEffect(() => {
    if (user) {
      loadWallet()
    } else {
      clear()
    }
  }, [clear, loadWallet, user])

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
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b bg-card px-[2cm] py-3 flex items-center justify-between">
      <div className="flex items-center gap-9">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Map className="h-4 w-4 text-primary-foreground" />
          </span>
          <h1 className="font-display text-lg font-semibold tracking-tight">{t('app.title')}</h1>
        </Link>

        {user && (
          <nav className="flex items-center gap-1">
            <Link
              to="/projects"
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/projects')
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
                location.pathname.startsWith('/trash')
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

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <LanguageSwitcher />
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
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
        )}
      </div>
    </header>
  )
}
