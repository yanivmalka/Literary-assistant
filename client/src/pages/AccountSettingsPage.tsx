import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ArrowLeft, Lock, Mail, Chrome } from 'lucide-react'

interface Identity {
  provider: string
  id?: string
  created_at?: string
}

export default function AccountSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, linkIdentity, updateUserPassword, getUserIdentities } = useAuthStore()
  
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
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setPasswordLoading(true)
    const { error: err } = await updateUserPassword(newPassword)
    
    if (err) {
      setError(err)
    } else {
      setSuccess('Password added successfully!')
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
      setSuccess('Google linking initiated. Complete the sign-in process.')
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
          <p className="text-muted-foreground mb-4">Please log in to view account settings</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-bold">Account Settings</h1>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md mb-6">
            {success}
          </div>
        )}

        {/* User Info */}
        <div className="border rounded-lg p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Email:</span> {user.email}</p>
            <p><span className="text-muted-foreground">User ID:</span> <code className="text-xs bg-muted px-2 py-1 rounded">{user.id.slice(0, 8)}...</code></p>
            <p><span className="text-muted-foreground">Created:</span> {new Date(user.created_at || '').toLocaleDateString()}</p>
          </div>
        </div>

        {/* Authentication Methods */}
        <div className="border rounded-lg p-6 bg-card mb-6">
          <h2 className="text-xl font-semibold mb-6">Authentication Methods</h2>
          
          <div className="space-y-4">
            {/* Email/Password */}
            <div className="border rounded-lg p-4 bg-background">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Email & Password</p>
                    <p className="text-sm text-muted-foreground">
                      {hasEmailIdentity ? 'Connected ✓' : 'Not connected'}
                    </p>
                  </div>
                </div>
                {hasEmailIdentity && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    Active
                  </span>
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
                      Add Password
                    </button>
                  ) : (
                    <form onSubmit={handleAddPassword} className="space-y-3">
                      <input
                        id="new-password"
                        name="new-password"
                        type="password"
                        placeholder="New password"
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
                        placeholder="Confirm password"
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
                          {passwordLoading ? 'Adding...' : 'Add Password'}
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
                          Cancel
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
                    <p className="font-medium">Google Account</p>
                    <p className="text-sm text-muted-foreground">
                      {hasGoogleIdentity ? 'Connected ✓' : 'Not connected'}
                    </p>
                  </div>
                </div>
                {hasGoogleIdentity && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    Active
                  </span>
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
                    {linkingLoading ? 'Linking...' : 'Link Google Account'}
                  </button>
                </div>
              )}

              {hasGoogleIdentity && (
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                  <p>You can sign in with your Google account.</p>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground">
              {hasEmailIdentity && hasGoogleIdentity
                ? '✓ Both authentication methods are linked to this account.'
                : hasEmailIdentity
                ? 'You can link a Google account for easier sign-in.'
                : hasGoogleIdentity
                ? 'You can add a password for email-based sign-in.'
                : 'Unknown authentication state'}
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="border border-muted rounded-lg p-4 bg-muted/20 text-sm text-muted-foreground">
          <p>
            <strong>Note:</strong> When you link multiple authentication methods, they all use the same account. 
            You can sign in using any linked method and access the same data and settings.
          </p>
        </div>
      </div>
    </div>
  )
}
