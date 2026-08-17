// ============================================
// Auth Middleware
// Extracts and validates user from Supabase JWT.
// Attaches user info to request for downstream handlers.
// ============================================

import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * Supabase client with service role key.
 * Used server-side to bypass RLS when needed (e.g., pipeline processing).
 */
export function getServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured')
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * User info attached to authenticated requests.
 */
export interface AuthenticatedUser {
  id: string
  email?: string
}

/**
 * Extend Express Request with user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

/**
 * Middleware that validates the Authorization header (Bearer token)
 * against Supabase Auth and attaches user info to the request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.substring(7) // Remove 'Bearer '

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Server not configured for authentication' })
    return
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    req.user = {
      id: user.id,
      email: user.email,
    }

    next()
  } catch (error) {
    res.status(500).json({ error: 'Authentication service error' })
  }
}

/**
 * Optional auth — attaches user if token present, but doesn't reject if missing.
 * Useful for endpoints that work with or without auth.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ') || !supabaseUrl || !supabaseServiceKey) {
    next()
    return
  }

  const token = authHeader.substring(7)

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user } } = await supabase.auth.getUser(token)

    if (user) {
      req.user = { id: user.id, email: user.email }
    }
  } catch {
    // Silently continue without user
  }

  next()
}
