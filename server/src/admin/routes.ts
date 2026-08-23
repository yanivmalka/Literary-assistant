import { timingSafeEqual } from 'node:crypto'
import { Router, Request, Response } from 'express'
import { getServiceClient } from '../middleware/auth.js'

const router = Router()

function hasValidMaintenanceToken(req: Request): boolean {
  const expected = process.env.LOG_MAINTENANCE_TOKEN?.trim()
  const provided = req.header('X-Log-Maintenance-Token')?.trim()

  if (!expected || !provided) return false

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer)
}

function rejectUnauthorized(req: Request, res: Response): boolean {
  if (hasValidMaintenanceToken(req)) return false

  res.status(401).json({ error: 'Unauthorized log maintenance request' })
  return true
}

/**
 * Fully resets all request/error log tables.
 * Requires a server-side maintenance token and explicit confirmation.
 */
router.post('/api/admin/logs/reset', async (req, res) => {
  if (rejectUnauthorized(req, res)) return

  if (req.body?.confirmation !== 'RESET_LOGS') {
    res.status(400).json({ error: 'confirmation must be RESET_LOGS' })
    return
  }

  // Do not create a new log row immediately after deleting all logs.
  res.locals.skipRequestLogging = true

  try {
    const { data, error } = await getServiceClient()
      .rpc('reset_request_error_logs')

    if (error) {
      console.error('[LogMaintenance] Failed to reset request/error logs:', error.message)
      res.status(500).json({ error: 'Failed to reset request/error logs' })
      return
    }

    res.json({ success: true, deleted: data?.[0] ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reset error'
    console.error('[LogMaintenance] Failed to reset request/error logs:', message)
    res.status(500).json({ error: 'Failed to reset request/error logs' })
  }
})

export default router
