import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { Map } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updateUserPassword } = useAuthStore()
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // supabase-js parses the recovery token from the URL and establishes a
    // temporary session; it may already be present or arrive via the listener.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession((prev) => prev ?? Boolean(session))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasRecoverySession(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'))
      return
    }

    setSaving(true)
    const { error: err } = await updateUserPassword(password)
    setSaving(false)

    if (err) {
      setError(err)
    } else {
      setDone(true)
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 2000)
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
          <h2 className="font-display text-lg font-semibold mb-6 text-center">{t('auth.resetPasswordTitle')}</h2>

          {done ? (
            <p className="text-sm text-muted-foreground text-center">{t('auth.passwordResetSuccess')}</p>
          ) : hasRecoverySession === false ? (
            <p className="text-sm text-muted-foreground text-center">
              {t('auth.resetLinkInvalid')}{' '}
              <Link to="/forgot-password" className="text-primary hover:underline">
                {t('auth.forgotPasswordTitle')}
              </Link>
            </p>
          ) : (
            <>
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-muted-foreground">
                    {t('auth.newPassword')}
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold mb-1.5 text-muted-foreground">
                    {t('auth.confirmPassword')}
                  </label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? t('common.loading') : t('auth.updatePassword')}
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
