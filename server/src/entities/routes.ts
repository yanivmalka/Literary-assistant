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

/**
 * POST /api/extract-entities
 * Extract entities from document chunks using HuggingFace LLM.
 * Called by client in batches after document reaches 'ready' status.
 */
router.post(
  '/extract-entities',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { version_id, project_id, user_id, offset = 0, limit = 3 } = req.body

      if (!version_id || !project_id || !user_id) {
        res.status(400).json({ error: 'version_id, project_id, and user_id are required' })
        return
      }

      const apiKey = process.env.HUGGINGFACE_API_KEY
      if (!apiKey) {
        res.json({ error: 'HUGGINGFACE_API_KEY not configured', skipped: true })
        return
      }

      const supabase = getServiceClient()

      // Get chunks batch
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content')
        .eq('version_id', version_id)
        .order('position', { ascending: true })
        .range(offset, offset + limit - 1)

      if (chunksError || !chunks || chunks.length === 0) {
        res.json({ done: true, saved: 0, entities_found: 0, next_offset: offset })
        return
      }

      // Build prompt
      const combined = chunks.map((c: { content: string }) => c.content).join('\n---\n')
      const prompt = `<s>[INST] You are an entity extractor for fantasy novels. Extract ALL named entities from the following text passages.

For each entity, provide:
- name: the entity's name exactly as it appears
- type: one of [character, location, country, continent, region, object, ability, magic_system, event]
- aliases: alternative names or references (empty array if none)
- attributes: key-value pairs of properties mentioned (e.g. {"eye_color": "blue", "hair": "black"})
- context: a short quote (max 20 words) showing where this entity appears

Important rules:
- This is a FANTASY novel. Names are invented and won't appear in any dictionary.
- Include ALL proper nouns referring to characters, places, items, or abilities.
- For characters: extract appearance details (hair, eyes, height, build, scars, clothing).
- For locations: extract terrain, climate, architecture, atmosphere.
- Do NOT include common nouns or generic descriptions.
- The text may be in Hebrew or English. Extract entities in the language they appear.

Return ONLY a valid JSON array. No other text before or after.

Text:
${combined} [/INST]`

      // Call HuggingFace
      const hfResponse = await fetch(
        'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { max_new_tokens: 2048, temperature: 0.1, return_full_text: false },
          }),
        }
      )

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text()
        res.status(502).json({ error: `HuggingFace API error: ${hfResponse.status} ${errorText}` })
        return
      }

      const hfData = await hfResponse.json() as Array<{ generated_text: string }>
      const responseText = hfData[0]?.generated_text || ''

      // Parse entities
      let entities: Array<{ name: string; type: string; aliases: string[]; attributes: Record<string, string>; context: string }> = []
      try {
        let jsonStr = responseText.trim()
        const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlock) jsonStr = codeBlock[1].trim()
        const arrStart = jsonStr.indexOf('[')
        const arrEnd = jsonStr.lastIndexOf(']')
        if (arrStart !== -1 && arrEnd > arrStart) jsonStr = jsonStr.slice(arrStart, arrEnd + 1)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) {
          entities = parsed.filter((e: unknown) => {
            if (typeof e !== 'object' || e === null) return false
            return typeof (e as Record<string, unknown>).name === 'string'
          }).map((e: Record<string, unknown>) => ({
            name: (e.name as string).trim(),
            type: typeof e.type === 'string' ? e.type : 'character',
            aliases: Array.isArray(e.aliases) ? e.aliases.filter((a: unknown) => typeof a === 'string') : [],
            attributes: typeof e.attributes === 'object' && e.attributes !== null ? e.attributes as Record<string, string> : {},
            context: typeof e.context === 'string' ? e.context : '',
          }))
        }
      } catch { /* parsing failed, entities stays empty */ }

      // Save to DB
      let saved = 0
      const validTypes = ['character', 'location', 'country', 'continent', 'region', 'object', 'ability', 'magic_system', 'event']
      const chunkIds = chunks.map((c: { id: string }) => c.id)

      // Deduplicate
      const uniqueMap = new Map<string, typeof entities[0]>()
      for (const entity of entities) {
        const key = entity.name.toLowerCase()
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, entity)
        } else {
          const existing = uniqueMap.get(key)!
          existing.attributes = { ...existing.attributes, ...entity.attributes }
        }
      }

      for (const [, entity] of uniqueMap) {
        try {
          const { data: existing } = await supabase
            .from('entities')
            .select('id, aliases')
            .eq('project_id', project_id)
            .ilike('name', entity.name)
            .limit(1)
            .maybeSingle()

          let entityId: string

          if (existing) {
            entityId = existing.id
            if (entity.aliases.length > 0) {
              const merged = [...new Set([...(existing.aliases || []), ...entity.aliases])]
              await supabase.from('entities').update({ aliases: merged }).eq('id', entityId)
            }
          } else {
            const entityType = validTypes.includes(entity.type) ? entity.type : 'character'
            const { data: newEntity, error: insertError } = await supabase
              .from('entities')
              .insert({
                project_id,
                user_id,
                name: entity.name,
                entity_type: entityType,
                status: 'pending',
                aliases: entity.aliases,
                metadata: { extracted_attributes: entity.attributes },
              })
              .select('id')
              .single()

            if (insertError || !newEntity) continue
            entityId = newEntity.id
          }

          // Save mention
          if (chunkIds.length > 0) {
            await supabase.from('entity_mentions').insert({
              entity_id: entityId,
              chunk_id: chunkIds[0],
              context_snippet: entity.context.slice(0, 500),
              mention_text: entity.name,
            })
          }

          // Save attributes
          const attrRecords = Object.entries(entity.attributes).map(([name, value]) => ({
            entity_id: entityId,
            attribute_name: name,
            attribute_value: String(value),
            source_chunk_id: chunkIds[0] || null,
            confidence: 0.8,
            data_origin: 'ai_extracted',
          }))

          if (attrRecords.length > 0) {
            await supabase.from('entity_attributes').insert(attrRecords)
          }

          saved++
        } catch (err) {
          console.error(`[Entities] Error saving '${entity.name}':`, err)
        }
      }

      const done = chunks.length < limit
      res.json({ done, saved, entities_found: entities.length, next_offset: offset + limit })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Entities] Error:', message)
      res.status(500).json({ error: message })
    }
  }
)

export default router
