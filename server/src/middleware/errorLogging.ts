// ============================================
// Request and Error Logging Middleware
// Records requests and links failed requests to detailed error records.
// ============================================

import { randomUUID } from 'node:crypto'
import { STATUS_CODES } from 'node:http'
import { Request, RequestHandler, Response } from 'express'
import { getServiceClient } from './auth.js'

interface RequestLog {
  request_id: string
  user_id: string | null
  action: string
  http_method: string
  request_path: string
  status_code: number
  started_at: string
  completed_at: string
  duration_ms: number
}

interface ErrorDetail {
  id: string
  error_code: string
  error_message: string
  status_code: number
  details: Record<string, unknown>
}

interface LegacyUserErrorLog extends ErrorDetail {
  user_id: string | null
  request_id: string
  action: string
  http_method: string
  request_path: string
}

function logPersistenceFailure(operation: string, message: string): void {
  console.error(`[ErrorLogging] Failed to persist ${operation}:`, message)
}

/**
 * Persists the request, detailed error, legacy error log, and relation in order.
 * Each operation is best-effort so logging never changes the completed response.
 */
async function persistRequestOutcome(request: RequestLog, errorDetail?: ErrorDetail): Promise<void> {
  try {
    const supabase = getServiceClient()
    const { error: requestError } = await supabase
      .from('user_request_logs')
      .insert(request)

    if (requestError) {
      logPersistenceFailure('request log', requestError.message)
    }

    if (!errorDetail) return

    const { error: detailError } = await supabase
      .from('error_details')
      .insert(errorDetail)

    if (detailError) {
      logPersistenceFailure('error detail', detailError.message)
      return
    }

    const legacyLog: LegacyUserErrorLog = {
      ...errorDetail,
      user_id: request.user_id,
      request_id: request.request_id,
      action: request.action,
      http_method: request.http_method,
      request_path: request.request_path,
    }

    const { error: legacyError } = await supabase
      .from('user_error_logs')
      .insert(legacyLog)

    if (legacyError) {
      logPersistenceFailure('legacy user error log', legacyError.message)
    }

    const { error: relationError } = await supabase
      .from('request_error_links')
      .insert({
        request_id: request.request_id,
        error_detail_id: errorDetail.id,
        user_error_log_id: legacyError ? null : errorDetail.id,
      })

    if (relationError) {
      logPersistenceFailure('request/error relation', relationError.message)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown logging error'
    logPersistenceFailure('request outcome', message)
  }
}

function getAction(req: Request): string {
  const routePath = typeof req.route?.path === 'string' ? req.route.path : req.path
  return `${req.method} ${req.baseUrl}${routePath}`
}

/**
 * Attach before application routes. Every request gets a correlation ID and a
 * request row; every 4xx/5xx response also gets an error detail and relation.
 */
export const userErrorLoggingMiddleware: RequestHandler = (req: Request, res: Response, next) => {
  const requestId = randomUUID()
  const startedAt = new Date()
  const startedAtMs = startedAt.getTime()

  res.setHeader('X-Request-ID', requestId)

  res.on('finish', () => {
    const completedAt = new Date()
    const request: RequestLog = {
      request_id: requestId,
      user_id: req.user?.id ?? null,
      action: getAction(req),
      http_method: req.method,
      request_path: req.path,
      status_code: res.statusCode,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: Math.max(0, completedAt.getTime() - startedAtMs),
    }

    if (res.statusCode >= 400 && res.statusCode <= 599) {
      const errorDetail: ErrorDetail = {
        id: randomUUID(),
        error_code: `HTTP_${res.statusCode}`,
        error_message: STATUS_CODES[res.statusCode] || 'Request failed',
        status_code: res.statusCode,
        details: {
          duration_ms: request.duration_ms,
        },
      }

      void persistRequestOutcome(request, errorDetail)
      return
    }

    void persistRequestOutcome(request)
  })

  next()
}
