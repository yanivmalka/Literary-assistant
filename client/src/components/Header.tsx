import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Map, LogOut, Trash2, FolderOpen, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import LanguageSwitcher from './LanguageSwitcher'

export default function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Map className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        </Link>

        {user && (
          <nav className="flex items-center gap-4">
            <Link
              to="/projects"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              {t('projects.title')}
            </Link>
            <Link
              to="/trash"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {t('projects.trash')}
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-4">
        <LanguageSwitcher />
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {profile?.display_name || user.email}
            </span>
            <Link
              to="/account-settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Account settings"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
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
