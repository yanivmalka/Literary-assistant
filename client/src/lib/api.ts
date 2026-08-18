// ============================================
// API Client
// Routes calls to the Express server (Railway in production, localhost in dev).
// Used for AI-dependent operations (entity extraction, Q&A, etc.)
// ============================================

import { supabase } from './supabase'

/**
 * Get the API base URL.
 * In production: Railway URL from VITE_API_URL env var.
 * In development: empty string (uses Vite proxy to localhost:3001).
 */
function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || ''
}

/**
 * Get auth headers for API calls.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Make an authenticated API call to the Express server.
 */
export async function apiCall<T = unknown>(
  path: string,
  options?: {
    method?: string
    body?: unknown
  }
): Promise<{ data: T | null; error: string | null }> {
  try {
    const baseUrl = getApiBaseUrl()
    const headers = await getAuthHeaders()

    const response = await fetch(`${baseUrl}${path}`, {
      method: options?.method || 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      return { data: null, error: errorData.error || `Request failed with status ${response.status}` }
    }

    const data = await response.json() as T
    return { data, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    return { data: null, error: message }
  }
}
