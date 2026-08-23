// ============================================
// User Error Logging Middleware
// Records failed HTTP actions without changing the response flow.
// ============================================

import { randomUUID } from 'node:crypto'
import { STATUS_CODES } from 'node:http'
import { Request, RequestHandler, Response } from 'express'
import { getServiceClient } from './auth.js'

interface UserErrorLog {
  user_id: string | null
  request_id: string
  action: string
  http_method: string
  request_path: string
  status_code: number
  error_code: string
  error_message: string
  details: Record<string, number>
}

/**
 * Writes a failed request to Supabase on a best-effort basis.
 * Logging must never affect the response that was already sent to the user.
 */
async function recordUserError(log: UserErrorLog): Promise<void> {
  try {
    const { error } = await getServiceClient()
      .from('user_error_logs')
      .insert(log)

    if (error) {
      console.error('[ErrorLogging] Failed to persist user error log:', error.message)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown logging error'
    console.error('[ErrorLogging] Failed to persist user error log:', message)
  }
}

function getAction(req: Request): string {
  const routePath = typeof req.route?.path === 'string' ? req.route.path : req.path
  return `${req.method} ${req.baseUrl}${routePath}`
}

/**
 * Attach before application routes. Every 4xx/5xx response is logged after
 * Express finishes sending it, including responses returned by existing
 * route-level catch blocks and middleware such as multer.
 */
export const userErrorLoggingMiddleware: RequestHandler = (req: Request, res: Response, next) => {
  const requestId = randomUUID()
  const startedAt = Date.now()

  res.on('finish', () => {
    if (res.statusCode < 400 || res.statusCode > 599) return

    void recordUserError({
      user_id: req.user?.id ?? null,
      request_id: requestId,
      action: getAction(req),
      http_method: req.method,
      request_path: req.path,
      status_code: res.statusCode,
      error_code: `HTTP_${res.statusCode}`,
      error_message: STATUS_CODES[res.statusCode] || 'Request failed',
      details: {
        duration_ms: Date.now() - startedAt,
      },
    })
  })

  next()
}
