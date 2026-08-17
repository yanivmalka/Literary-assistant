// ============================================
// Profile Routes
// CRUD for profiles, creation from entities, field editing.
// ============================================

import { Router, Request, Response } from 'express'
import { requireAuth, getServiceClient } from '../middleware/auth.js'
import { createProfileFromEntity, updateProfileField } from './service.js'

const router = Router()

/**
 * POST /api/projects/:projectId/entities/:entityId/create-profile
 * Create a profile from a confirmed entity.
 */
router.post(
  '/projects/:projectId/entities/:entityId/create-profile',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, entityId } = req.params as { projectId: string; entityId: string }
      const userId = req.user!.id

      const result = await createProfileFromEntity(entityId, projectId, userId)

      if (!result.profileId) {
        res.status(400).json({ error: result.error })
        return
      }

      res.status(201).json({ profile_id: result.profileId })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/profiles
 * List all profiles for a project.
 */
router.get(
  '/projects/:projectId/profiles',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string }
      const userId = req.user!.id
      const { type } = req.query
      const supabase = getServiceClient()

      let query = supabase
        .from('profiles_base')
        .select(`
          id, profile_type, profile_data, image_url, created_at, updated_at,
          entities (id, name, entity_type, status)
        `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (type && typeof type === 'string') {
        query = query.eq('profile_type', type)
      }

      const { data, error } = await query

      if (error) {
        res.status(500).json({ error: 'Failed to fetch profiles' })
        return
      }

      res.json({ profiles: data || [] })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/profiles/:profileId
 * Get a single profile with field sources.
 */
router.get(
  '/projects/:projectId/profiles/:profileId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, profileId } = req.params as { projectId: string; profileId: string }
      const userId = req.user!.id
      const supabase = getServiceClient()

      const { data: profile } = await supabase
        .from('profiles_base')
        .select(`
          id, entity_id, profile_type, profile_data, image_url, created_at, updated_at,
          entities (id, name, entity_type, status, aliases)
        `)
        .eq('id', profileId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!profile) {
        res.status(404).json({ error: 'Profile not found' })
        return
      }

      // Get field sources
      const { data: fieldSources } = await supabase
        .from('profile_field_sources')
        .select('field_path, source_type, source_chunk_id, last_modified_at')
        .eq('profile_id', profileId)

      res.json({ profile, field_sources: fieldSources || [] })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * PATCH /api/projects/:projectId/profiles/:profileId
 * Update profile fields. Respects field source protection.
 */
router.patch(
  '/projects/:projectId/profiles/:profileId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { profileId } = req.params as { profileId: string }
      const userId = req.user!.id
      const { fields } = req.body // { fields: { fieldPath: value, ... } }

      if (!fields || typeof fields !== 'object') {
        res.status(400).json({ error: 'fields object is required' })
        return
      }

      const errors: string[] = []
      for (const [fieldPath, value] of Object.entries(fields)) {
        const result = await updateProfileField(profileId, fieldPath, value as string, userId)
        if (!result.success) {
          errors.push(`${fieldPath}: ${result.error}`)
        }
      }

      if (errors.length > 0) {
        res.status(207).json({ success: true, partial_errors: errors })
        return
      }

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * DELETE /api/projects/:projectId/profiles/:profileId
 * Delete a profile.
 */
router.delete(
  '/projects/:projectId/profiles/:profileId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, profileId } = req.params as { projectId: string; profileId: string }
      const userId = req.user!.id
      const supabase = getServiceClient()

      const { error } = await supabase
        .from('profiles_base')
        .delete()
        .eq('id', profileId)
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) {
        res.status(500).json({ error: 'Failed to delete profile' })
        return
      }

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router
