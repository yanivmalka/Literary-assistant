import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useTheme, type ThemeTransitionMode, type ExtractionProgressStyle, type AccentColor } from '@/components/ThemeProvider'
import { ArrowLeft, Lock, Mail, Chrome, Check } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

const ACCENT_OPTIONS: AccentColor[] = ['indigo', 'forest', 'ember', 'rose']
const ACCENT_SWATCH_CLASSES: Record<AccentColor, string> = {
  indigo: 'bg-[hsl(245_32%_30%)] dark:bg-[hsl(245_55%_74%)]',
  forest: 'bg-[hsl(155_35%_28%)] dark:bg-[hsl(155_45%_62%)]',
  ember: 'bg-[hsl(28_60%_36%)] dark:bg-[hsl(30_65%_64%)]',
  rose: 'bg-[hsl(350_45%_42%)] dark:bg-[hsl(350_55%_70%)]',
}

interface Identity {
  provider: string
  id?: string
  created_at?: string
}

export default function AccountSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, linkIdentity, updateUserPassword, getUserIdentities } = useAuthStore()
  const { themeSettings, updateThemeSettings } = useTheme()
  
  const [identities, setIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [linkingLoading, setLinkingLoading] = useState(false)
  
  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Load identities on mount
  useEffect(() => {
    const loadIdentities = async () => {
      setLoading(true)
      setError(null)
      
      const { identities: data, error: err } = await getUserIdentities()
      if (err) {
        setError(err)
      } else if (data) {
        setIdentities(data)
      }
      
      setLoading(false)
    }

    if (user) {
      loadIdentities()
    }
  }, [user, getUserIdentities])

  const hasEmailIdentity = identities.some(id => id.provider === 'email')
  const hasGoogleIdentity = identities.some(id => id.provider === 'google')
  const hasPassword = identities.some(id => id.provider === 'email') && user?.email_confirmed_at

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }

    if (newPassword.length < 6) {
      setError(t('auth.passwordMinLength'))
      return
    }

    setPasswordLoading(true)
    const { error: err } = await updateUserPassword(newPassword)
    
    if (err) {
      setError(err)
    } else {
      setSuccess(t('auth.passwordAdded'))
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
      
      // Reload identities to reflect the change
      const { identities: data } = await getUserIdentities()
      if (data) {
        setIdentities(data)
      }
    }
    
    setPasswordLoading(false)
  }

  const handleLinkGoogle = async () => {
    setError(null)
    setLinkingLoading(true)
    
    const { error: err } = await linkIdentity('google')
    if (err) {
      setError(err)
    } else {
      setSuccess(t('auth.googleLinkingStarted'))
    }
    
    setLinkingLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t('common.loading')}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{t('ui.account.loginRequired')}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            {t('ui.account.goToLogin')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center hover:bg-muted rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('ui.account.settings')}</h1>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-success-soft text-success text-sm p-3 rounded-md mb-6">
            {success}
          </div>
        )}

        {/* User Info */}
        <div className="border rounded-lg p-4 sm:p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold mb-4">{t('ui.account.accountInformation')}</h2>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">{t('ui.account.email')}</span> {user.email}</p>
            <p><span className="text-muted-foreground">{t('ui.account.userId')}</span> <code className="text-xs bg-muted px-2 py-1 rounded">{user.id.slice(0, 8)}...</code></p>
            <p><span className="text-muted-foreground">{t('ui.account.created')}</span> {new Date(user.created_at || '').toLocaleDateString()}</p>
          </div>
        </div>

        {/* Appearance */}
        <div className="border rounded-lg p-4 sm:p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold">{t('ui.theme.appearanceTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('ui.theme.appearanceDescription')}</p>

          <div className="mt-6 space-y-5">
            <div>
              <span className="block text-sm font-medium mb-2">{t('ui.theme.accentTitle')}</span>
              <p className="text-sm text-muted-foreground mb-3">{t('ui.theme.accentDescription')}</p>
              <div className="flex items-center gap-3">
                {ACCENT_OPTIONS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    onClick={() => updateThemeSettings({ accent })}
                    title={t(`ui.theme.accent.${accent}`)}
                    aria-label={t(`ui.theme.accent.${accent}`)}
                    aria-pressed={themeSettings.accent === accent}
                    className={`h-8 w-8 rounded-full flex items-center justify-center transition-shadow ${ACCENT_SWATCH_CLASSES[accent]} ${
                      themeSettings.accent === accent ? 'ring-2 ring-offset-2 ring-offset-background ring-ring' : ''
                    }`}
                  >
                    {themeSettings.accent === accent && <Check className="h-4 w-4 text-primary-foreground" />}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start justify-between gap-4 cursor-pointer border-t pt-5">
              <span>
                <span className="block font-medium">{t('ui.theme.transitionEnabled')}</span>
                <span className="block mt-1 text-sm text-muted-foreground">
                  {t('ui.theme.transitionEnabledDescription')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={themeSettings.transitionEnabled}
                onChange={(event) => updateThemeSettings({ transitionEnabled: event.target.checked })}
                className="mt-1 h-5 w-5 accent-primary"
              />
            </label>

            <div className="border-t pt-5">
              <label htmlFor="theme-transition-mode" className="block text-sm font-medium mb-2">
                {t('ui.theme.transitionMode')}
              </label>
              <select
                id="theme-transition-mode"
                value={themeSettings.transitionMode}
                onChange={(event) => updateThemeSettings({ transitionMode: event.target.value as ThemeTransitionMode })}
                disabled={!themeSettings.transitionEnabled}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="immediate">{t('ui.theme.immediate')}</option>
                <option value="gradual">{t('ui.theme.gradual')}</option>
              </select>
            </div>

            <div className="border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="theme-transition-duration" className="text-sm font-medium">
                  {t('ui.theme.duration')}
                </label>
                <output htmlFor="theme-transition-duration" className="text-sm text-muted-foreground">
                  {t('ui.theme.seconds', { value: (themeSettings.durationMs / 1000).toFixed(1) })}
                </output>
              </div>
              <input
                id="theme-transition-duration"
                type="range"
                min="500"
                max="10000"
                step="500"
                value={themeSettings.durationMs}
                onChange={(event) => updateThemeSettings({ durationMs: Number(event.target.value) })}
                disabled={!themeSettings.transitionEnabled || themeSettings.transitionMode === 'immediate'}
                className="mt-3 w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('ui.theme.durationDescription')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t('ui.theme.reducedMotionHint')}</p>
            </div>
          </div>
        </div>

        {/* Extraction Progress Style */}
        <div className="border rounded-lg p-4 sm:p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold">{t('ui.extraction.progressStyleTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('ui.extraction.progressStyleDescription')}</p>

          <div className="mt-6">
            <label htmlFor="extraction-progress-style" className="block text-sm font-medium mb-2">
              {t('ui.extraction.progressStyleLabel')}
            </label>
            <select
              id="extraction-progress-style"
              value={themeSettings.extractionProgressStyle}
              onChange={(event) =>
                updateThemeSettings({ extractionProgressStyle: event.target.value as ExtractionProgressStyle })
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="bar">{t('ui.extraction.progressStyleBar')}</option>
              <option value="sword">{t('ui.extraction.progressStyleSword')}</option>
              <option value="minimal">{t('ui.extraction.progressStyleMinimal')}</option>
            </select>
          </div>
        </div>

        {/* Authentication Methods */}
        <div className="border rounded-lg p-4 sm:p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold mb-6">{t('ui.account.authenticationMethods')}</h2>
          
          <div className="space-y-4">
            {/* Email/Password */}
            <div className="border rounded-lg p-4 bg-background">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('ui.account.emailPassword')}</p>
                    <p className="text-sm text-muted-foreground">
                      {hasEmailIdentity ? t('ui.account.connected') : t('ui.account.notConnected')}
                    </p>
                  </div>
                </div>
                {hasEmailIdentity && (
                  <Badge variant="success">{t('ui.account.active')}</Badge>
                )}
              </div>

              {/* Add Password Section (for Google-only users) */}
              {hasEmailIdentity && !hasPassword && (
                <div className="mt-4 pt-4 border-t">
                  {!showPasswordForm ? (
                    <button
                      onClick={() => setShowPasswordForm(true)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Lock className="h-4 w-4" />
                      {t('ui.account.addPassword')}
                    </button>
                  ) : (
                    <form onSubmit={handleAddPassword} className="space-y-3">
                      <input
                        id="new-password"
                        name="new-password"
                        type="password"
                        placeholder={t('ui.account.newPassword')}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <input
                        id="confirm-password"
                        name="confirm-password"
                        type="password"
                        placeholder={t('ui.account.confirmPassword')}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={passwordLoading}
                          className="flex-1 py-2 px-3 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {passwordLoading ? t('ui.common.saving') : t('ui.account.addPassword')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordForm(false)
                            setNewPassword('')
                            setConfirmPassword('')
                          }}
                          className="flex-1 py-2 px-3 border text-sm rounded-md hover:bg-muted transition-colors"
                        >
                          {t('ui.account.cancel')}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Google OAuth */}
            <div className="border rounded-lg p-4 bg-background">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Chrome className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('ui.account.googleAccount')}</p>
                    <p className="text-sm text-muted-foreground">
                      {hasGoogleIdentity ? t('ui.account.connected') : t('ui.account.notConnected')}
                    </p>
                  </div>
                </div>
                {hasGoogleIdentity && (
                  <Badge variant="success">{t('ui.account.active')}</Badge>
                )}
              </div>

              {/* Link Google Section */}
              {!hasGoogleIdentity && (
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={handleLinkGoogle}
                    disabled={linkingLoading}
                    className="flex items-center gap-2 text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    <Chrome className="h-4 w-4" />
                    {linkingLoading ? t('ui.account.linking') : t('ui.account.linkGoogle')}
                  </button>
                </div>
              )}

              {hasGoogleIdentity && (
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                  <p>{t('ui.account.canSignInGoogle')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground">
                  {hasEmailIdentity && hasGoogleIdentity
                ? t('ui.account.bothLinked')
                : hasEmailIdentity
                ? t('ui.account.linkGoogleHint')
                : hasGoogleIdentity
                ? t('ui.account.addPasswordHint')
                : t('ui.account.unknownAuthState')}
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="border border-muted rounded-lg p-4 bg-muted/20 text-sm text-muted-foreground">
          <p>
            <strong>{t('ui.account.note')}</strong> {t('ui.account.sameAccount')} {t('ui.account.sameData')}
          </p>
        </div>
      </div>
    </div>
  )
}
