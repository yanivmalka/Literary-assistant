import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Map } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signIn, signInWithGoogle, loading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const result = await signIn(email, password)
    if (result.error) {
      setError(result.error)
    } else {
      navigate('/')
    }
  }

  const handleGoogle = async () => {
    const result = await signInWithGoogle()
    if (result.error) {
      setError(result.error)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-primary" style={{ height: 52, width: 52 }}>
            <Map className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('app.title')}</h1>
        </div>

        <div className="border border-border rounded-2xl p-7 bg-card shadow-sm">
          <h2 className="font-display text-lg font-semibold mb-6 text-center">{t('auth.login')}</h2>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold mb-1.5 text-muted-foreground">
                {t('auth.email')}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-muted-foreground">
                {t('auth.password')}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t('common.loading') : t('auth.login')}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-sm text-muted-foreground">{t('ui.common.or')}</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <Button onClick={handleGoogle} variant="secondary" className="w-full">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t('auth.loginWithGoogle')}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="text-primary hover:underline">
              {t('auth.signup')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
