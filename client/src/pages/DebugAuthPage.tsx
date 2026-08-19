import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Debug page to test auth flows and capture full responses
 * Navigate to /debug-auth to use this page
 */
export default function DebugAuthPage() {
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
    addLog(`Starting signup with email: ${testEmail}`)

    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    })

    addLog(`signUp response received`)
    addLog(`=== SIGNUP RESPONSE ===`)
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
    addLog(`Starting signin with email: ${testEmail}`)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    addLog(`signIn response received`)
    addLog(`=== SIGNIN RESPONSE ===`)
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
        <h1 className="text-3xl font-bold mb-8">Auth Debug Page</h1>

        <div className="grid grid-cols-2 gap-8">
          {/* Left side - Forms */}
          <div>
            <div className="space-y-6">
              {/* Email/Password Input */}
              <div className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">Test Credentials</h2>
                <input
                  type="email"
                  placeholder="test@example.com (NEW EMAIL)"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded mb-3 bg-background"
                />
                <input
                  type="password"
                  placeholder="Test password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded mb-4 bg-background"
                />
              </div>

              {/* SignUp Form */}
              <form onSubmit={handleSignUp} className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">Test Sign Up</h2>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700"
                  disabled={!testEmail || !testPassword}
                >
                  Test signUp()
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Tests: supabase.auth.signUp(email, password)
                </p>
              </form>

              {/* SignIn Form */}
              <form onSubmit={handleSignIn} className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-4">Test Sign In</h2>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700"
                  disabled={!testEmail || !testPassword}
                >
                  Test signInWithPassword()
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Tests: supabase.auth.signInWithPassword(email, password)
                </p>
              </form>

              {/* Quick Info */}
              <div className="border rounded-lg p-4 bg-card text-sm">
                <p className="text-muted-foreground">
                  <strong>Instructions:</strong>
                </p>
                <ol className="list-decimal list-inside text-muted-foreground mt-2 space-y-1">
                  <li>Enter a NEW email (not yet in Supabase)</li>
                  <li>Enter any password (min 6 chars)</li>
                  <li>Click "Test signUp()"</li>
                  <li>Check browser console logs (F12 → Console)</li>
                  <li>Check email inbox for confirmation</li>
                  <li>After confirming, test signIn()</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Right side - Logs */}
          <div className="border rounded-lg p-4 bg-card overflow-auto max-h-screen">
            <h2 className="text-xl font-semibold mb-4 sticky top-0">Detailed Logs</h2>
            <div className="space-y-1 font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet. Run a test to see responses.</p>
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
              <h3 className="font-semibold mb-2">Latest SignUp Response</h3>
              <pre className="text-xs bg-background p-3 rounded overflow-auto max-h-64">
                {JSON.stringify(signupResponse, null, 2)}
              </pre>
            </div>
          )}
          {signinResponse && (
            <div className="border rounded-lg p-4 bg-card">
              <h3 className="font-semibold mb-2">Latest SignIn Response</h3>
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
