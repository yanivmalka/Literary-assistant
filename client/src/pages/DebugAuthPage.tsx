import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

/**
 * Debug page to test auth flows and capture full responses
 * Navigate to /debug-auth to use this page
 */
export default function DebugAuthPage() {
  const { t } = useTranslation()
  const [testEmail, setTestEmail] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [signupResponse, setSignupResponse] = useState<any>(null)
  const [signinResponse, setSigninResponse] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLogs([])
    addLog(t('ui.debugAuth.logs.startingSignUp', { email: testEmail }))

    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    })

    addLog(t('ui.debugAuth.logs.signUpReceived'))
    addLog(t('ui.debugAuth.logs.signUpHeader'))
    addLog(`data: ${JSON.stringify(data, null, 2)}`)
    addLog(`error: ${JSON.stringify(error, null, 2)}`)
    addLog(`data.user: ${JSON.stringify(data?.user, null, 2)}`)
    addLog(`data.session: ${JSON.stringify(data?.session, null, 2)}`)
    if (data?.user) {
      addLog(`user.email: ${data.user.email}`)
      addLog(`user.email_confirmed_at: ${data.user.email_confirmed_at}`)
      addLog(`user.id: ${data.user.id}`)
      addLog(`user.created_at: ${data.user.created_at}`)
    }
    if (error) {
      addLog(`error.code: ${error.code}`)
      addLog(`error.message: ${error.message}`)
      addLog(`error.status: ${error.status}`)
    }

    setSignupResponse({ data, error })
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLogs([])
    addLog(t('ui.debugAuth.logs.startingSignIn', { email: testEmail }))

    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    addLog(t('ui.debugAuth.logs.signInReceived'))
    addLog(t('ui.debugAuth.logs.signInHeader'))
    addLog(`data: ${JSON.stringify(data, null, 2)}`)
    addLog(`error: ${JSON.stringify(error, null, 2)}`)
    if (data?.user) {
      addLog(`user.email: ${data.user.email}`)
      addLog(`user.email_confirmed_at: ${data.user.email_confirmed_at}`)
      addLog(`session.access_token present: ${!!data.session?.access_token}`)
    }
    if (error) {
      addLog(`error.code: ${error.code}`)
      addLog(`error.message: ${error.message}`)
      addLog(`error.status: ${error.status}`)
    }

    setSigninResponse({ data, error })
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{t('ui.debugAuth.title')}</h1>

        <div className="grid grid-cols-2 gap-8">
          {/* Left side - Forms */}
          <div>
            <div className="space-y-6">
              {/* Email/Password Input */}
              <div className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">{t('ui.debugAuth.credentials')}</h2>
                <input
                  id="test-email"
                  name="test-email"
                  type="email"
                  placeholder={t('ui.debugAuth.emailPlaceholder')}
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded mb-3 bg-background"
                  autoComplete="email"
                />
                <input
                  id="test-password"
                  name="test-password"
                  type="password"
                  placeholder={t('ui.debugAuth.passwordPlaceholder')}
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded mb-4 bg-background"
                  autoComplete="current-password"
                />
              </div>

              {/* SignUp Form */}
              <form onSubmit={handleSignUp} className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">{t('ui.debugAuth.signUpTitle')}</h2>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700"
                  disabled={!testEmail || !testPassword}
                >
                  {t('ui.debugAuth.signUpButton')}
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('ui.debugAuth.signUpTests')}
                </p>
              </form>

              {/* SignIn Form */}
              <form onSubmit={handleSignIn} className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">{t('ui.debugAuth.signInTitle')}</h2>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700"
                  disabled={!testEmail || !testPassword}
                >
                  {t('ui.debugAuth.signInButton')}
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('ui.debugAuth.signInTests')}
                </p>
              </form>

              {/* Quick Info */}
              <div className="border rounded-lg p-4 bg-card text-sm">
                <p className="text-muted-foreground">
                  <strong>{t('ui.debugAuth.instructionsTitle')}</strong>
                </p>
                <ol className="list-decimal list-inside text-muted-foreground mt-2 space-y-1">
                  <li>{t('ui.debugAuth.instructionNewEmail')}</li>
                  <li>{t('ui.debugAuth.instructionPassword')}</li>
                  <li>{t('ui.debugAuth.instructionSignUp')}</li>
                  <li>{t('ui.debugAuth.instructionConsole')}</li>
                  <li>{t('ui.debugAuth.instructionInbox')}</li>
                  <li>{t('ui.debugAuth.instructionSignIn')}</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Right side - Logs */}
          <div className="border rounded-lg p-4 bg-card overflow-auto max-h-screen">
            <h2 className="text-xl font-semibold mb-4 sticky top-0">{t('ui.debugAuth.logsTitle')}</h2>
            <div className="space-y-1 font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">{t('ui.debugAuth.noLogs')}</p>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="text-xs py-0.5">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* JSON Responses */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          {signupResponse && (
            <div className="border rounded-lg p-4 bg-card">
              <h3 className="font-semibold mb-2">{t('ui.debugAuth.latestSignUp')}</h3>
              <pre className="text-xs bg-background p-3 rounded overflow-auto max-h-64">
                {JSON.stringify(signupResponse, null, 2)}
              </pre>
            </div>
          )}
          {signinResponse && (
            <div className="border rounded-lg p-4 bg-card">
              <h3 className="font-semibold mb-2">{t('ui.debugAuth.latestSignIn')}</h3>
              <pre className="text-xs bg-background p-3 rounded overflow-auto max-h-64">
                {JSON.stringify(signinResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
