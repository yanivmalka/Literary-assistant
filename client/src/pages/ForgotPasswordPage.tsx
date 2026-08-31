import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Map } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { sendPasswordReset, loading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const result = await sendPasswordReset(email)
    if (result.error) {
      setError(result.error)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl bg-primary" style={{ height: 52, width: 52 }}>
            <Map className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('app.title')}</h1>
        </div>

        <div className="border border-border rounded-2xl p-7 bg-card shadow-sm">
          <h2 className="font-display text-lg font-semibold mb-6 text-center">{t('auth.forgotPasswordTitle')}</h2>

          {sent ? (
            <p className="text-sm text-muted-foreground text-center">
              {t('auth.resetLinkSent', { email })}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">{t('auth.forgotPasswordBody')}</p>

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

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? t('common.loading') : t('auth.sendResetLink')}
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
