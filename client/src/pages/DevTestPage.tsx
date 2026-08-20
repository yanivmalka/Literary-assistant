import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Zap, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Telemetry {
  model: string
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  cached_tokens: number | null
  latency_ms: number
}

interface SuccessResponse {
  success: true
  response: string
  telemetry: Telemetry
}

interface ErrorResponse {
  success: false
  error: string
  status: number
  details: string | null
}

type GeminiResponse = SuccessResponse | ErrorResponse

const DEFAULT_PROMPT = 'Describe a fantasy character in 2 sentences.'

export default function DevTestPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeminiResponse | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const handleTest = async () => {
    setLoading(true)
    setResult(null)
    setNetworkError(null)

    try {
      const { data, error } = await supabase.functions.invoke('test-gemini', {
        body: { prompt: prompt.trim() },
      })

      if (error) {
        setNetworkError(error.message || 'Failed to invoke Edge Function')
        return
      }

      setResult(data as GeminiResponse)
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : 'Unknown network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Zap className="h-6 w-6 text-yellow-500" />
        <h2 className="text-2xl font-bold">Gemini Smoke Test</h2>
      </div>

      <p className="text-muted-foreground mb-6">
        Tests connectivity: Frontend → Supabase Edge Function → Gemini 2.5 Flash → Frontend
      </p>

      {/* Prompt input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Prompt</label>
        <textarea
          id="dev-test-prompt"
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoComplete="off"
          rows={4}
          className="w-full rounded-lg border bg-background p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Enter a prompt to send to Gemini..."
        />
      </div>

      {/* Test button */}
      <button
        onClick={handleTest}
        disabled={loading || !prompt.trim()}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for Gemini...
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Test Gemini
          </>
        )}
      </button>

      {/* Network error */}
      {networkError && (
        <div className="mt-6 p-4 border border-destructive/50 bg-destructive/5 rounded-lg">
          <div className="flex items-center gap-2 text-destructive font-medium mb-1">
            <AlertCircle className="h-4 w-4" />
            Network / Edge Function Error
          </div>
          <p className="text-sm text-destructive/80">{networkError}</p>
        </div>
      )}

      {/* Gemini error response */}
      {result && !result.success && (
        <div className="mt-6 p-4 border border-destructive/50 bg-destructive/5 rounded-lg">
          <div className="flex items-center gap-2 text-destructive font-medium mb-2">
            <AlertCircle className="h-4 w-4" />
            Gemini Error (HTTP {result.status})
          </div>
          <p className="text-sm font-medium">{result.error}</p>
          {result.details && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Raw error details
              </summary>
              <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {result.details}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Success response */}
      {result && result.success && (
        <div className="mt-6 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Connection successful!</span>
          </div>

          {/* Telemetry */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <TelemetryCard label="Model" value={result.telemetry.model} />
            <TelemetryCard
              label="Input Tokens"
              value={result.telemetry.input_tokens?.toLocaleString() ?? '—'}
            />
            <TelemetryCard
              label="Output Tokens"
              value={result.telemetry.output_tokens?.toLocaleString() ?? '—'}
            />
            <TelemetryCard
              label="Total Tokens"
              value={result.telemetry.total_tokens?.toLocaleString() ?? '—'}
            />
            <TelemetryCard
              label="Cached Tokens"
              value={result.telemetry.cached_tokens?.toLocaleString() ?? '—'}
            />
            <TelemetryCard
              label="Latency"
              value={`${result.telemetry.latency_ms.toLocaleString()} ms`}
            />
          </div>

          {/* Response text */}
          <div>
            <label className="block text-sm font-medium mb-2">Gemini Response</label>
            <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap leading-relaxed">
              {result.response}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TelemetryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded-lg bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-medium mt-0.5">{value}</div>
    </div>
  )
}
