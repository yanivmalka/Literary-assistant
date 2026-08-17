// ============================================
// Entity Routes
// CRUD for entities, merge, contradictions.
// ============================================

import { Router, Request, Response } from 'express'
import { requireAuth, getServiceClient } from '../middleware/auth.js'
import { findDuplicates, mergeEntities } from './deduplicator.js'
import { resolveContradiction } from './contradictions.js'

const router = Router()

/**
 * GET /api/projects/:projectId/entities
 * List entities, optionally filtered by type and status.
 */
router.get(
  '/projects/:projectId/entities',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params
      const userId = req.user!.id
      const { type, status } = req.query
      const supabase = getServiceClient()

      let query = supabase
        .from('entities')
        .select('id, name, entity_type, status, aliases, metadata, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .neq('status', 'merged')
        .order('name')

      if (type && typeof type === 'string') {
        query = query.eq('entity_type', type)
      }
      if (status && typeof status === 'string') {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) {
        res.status(500).json({ error: 'Failed to fetch entities' })
        return
      }

      res.json({ entities: data || [] })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/entities/:entityId
 * Get entity detail with mentions.
 */
router.get(
  '/projects/:projectId/entities/:entityId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, entityId } = req.params
      const userId = req.user!.id
      const supabase = getServiceClient()

      const { data: entity } = await supabase
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!entity) {
        res.status(404).json({ error: 'Entity not found' })
        return
      }

      // Get mentions
      const { data: mentions } = await supabase
        .from('entity_mentions')
        .select(`
          id, context_snippet, mention_text, position_start, position_end, created_at,
          document_chunks (
            id, chapter_number, chapter_title, page, position,
            document_versions ( id, version_number, document_id )
          )
        `)
        .eq('entity_id', entityId)
        .order('created_at')

      // Get attributes
      const { data: attributes } = await supabase
        .from('entity_attributes')
        .select('id, attribute_name, attribute_value, confidence, data_origin, source_chunk_id, created_at')
        .eq('entity_id', entityId)
        .order('attribute_name')

      // Get relations
      const { data: relations } = await supabase
        .from('entity_relations')
        .select(`
          id, relation_type, confidence, status,
          target:target_entity_id (id, name, entity_type)
        `)
        .eq('source_entity_id', entityId)

      res.json({
        entity,
        mentions: mentions || [],
        attributes: attributes || [],
        relations: relations || [],
      })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * PATCH /api/projects/:projectId/entities/:entityId
 * Update entity status (confirm, dismiss).
 */
router.patch(
  '/projects/:projectId/entities/:entityId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, entityId } = req.params
      const userId = req.user!.id
      const { status, name, entity_type } = req.body
      const supabase = getServiceClient()

      const updates: Record<string, unknown> = {}
      if (status) updates.status = status
      if (name) updates.name = name
      if (entity_type) updates.entity_type = entity_type

      const { error } = await supabase
        .from('entities')
        .update(updates)
        .eq('id', entityId)
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) {
        res.status(500).json({ error: 'Failed to update entity' })
        return
      }

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/entities/suggestions/merge
 * Get merge suggestions (duplicates).
 */
router.get(
  '/projects/:projectId/entities/suggestions/merge',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string }
      const suggestions = await findDuplicates(projectId)
      res.json({ suggestions })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * POST /api/projects/:projectId/entities/merge
 * Merge two entities.
 */
router.post(
  '/projects/:projectId/entities/merge',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { entity_a_id, entity_b_id } = req.body

      if (!entity_a_id || !entity_b_id) {
        res.status(400).json({ error: 'entity_a_id and entity_b_id are required' })
        return
      }

      const result = await mergeEntities(entity_a_id, entity_b_id)

      if (!result.success) {
        res.status(400).json({ error: result.error })
        return
      }

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/contradictions
 * List contradictions for a project.
 */
router.get(
  '/projects/:projectId/contradictions',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params
      const userId = req.user!.id
      const { status } = req.query
      const supabase = getServiceClient()

      let query = supabase
        .from('contradictions')
        .select(`
          id, contradiction_type, status, description, resolution_note, created_at, resolved_at,
          entity:entity_id (id, name, entity_type),
          attribute_a:attribute_a_id (id, attribute_name, attribute_value, source_chunk_id),
          attribute_b:attribute_b_id (id, attribute_name, attribute_value, source_chunk_id)
        `)
        .in('entity_id', (
          supabase.from('entities').select('id').eq('project_id', projectId).eq('user_id', userId)
        ) as unknown as string[])

      if (status && typeof status === 'string') {
        query = query.eq('status', status)
      }

      // Workaround: fetch entities first then contradictions
      const { data: entities } = await supabase
        .from('entities')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (!entities || entities.length === 0) {
        res.json({ contradictions: [] })
        return
      }

      const entityIds = entities.map(e => e.id)

      let contradictionsQuery = supabase
        .from('contradictions')
        .select(`
          id, contradiction_type, status, description, resolution_note, created_at, resolved_at,
          entities (id, name, entity_type),
          attribute_a:attribute_a_id (id, attribute_name, attribute_value, source_chunk_id),
          attribute_b:attribute_b_id (id, attribute_name, attribute_value, source_chunk_id)
        `)
        .in('entity_id', entityIds)
        .order('created_at', { ascending: false })

      if (status && typeof status === 'string') {
        contradictionsQuery = contradictionsQuery.eq('status', status)
      }

      const { data, error } = await contradictionsQuery

      if (error) {
        res.status(500).json({ error: 'Failed to fetch contradictions' })
        return
      }

      res.json({ contradictions: data || [] })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * PATCH /api/projects/:projectId/contradictions/:contradictionId
 * Resolve a contradiction.
 */
router.patch(
  '/projects/:projectId/contradictions/:contradictionId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { contradictionId } = req.params as { contradictionId: string; projectId: string }
      const { status, resolution_note } = req.body

      const validStatuses = ['resolved_fix_profile', 'resolved_fix_text', 'resolved_intentional', 'ignored']
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid resolution status' })
        return
      }

      const result = await resolveContradiction(contradictionId, status, resolution_note)

      if (!result.success) {
        res.status(500).json({ error: result.error })
        return
      }

      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router
