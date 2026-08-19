import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { type EntityType } from '@/lib/entityTypes'

export interface Entity {
  id: string
  name: string
  entity_type: string
  status: string
  aliases: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Knowledge layer fields
  entity_types?: string[]
  description?: string | null
  attributes?: Record<string, unknown>
  structured_fields?: Record<string, unknown>
  source?: string
}

export interface EntityMention {
  id: string
  context_snippet: string
  mention_text: string
  created_at: string
  document_chunks?: {
    id: string
    chapter_number: number | null
    chapter_title: string | null
    page: number | null
    position: number
  }
}

export interface MergeSuggestion {
  entityA: { id: string; name: string; type: string; aliases: string[] }
  entityB: { id: string; name: string; type: string; aliases: string[] }
  confidence: number
  reason: string
}

interface EntityState {
  entities: Entity[]
  mergeSuggestions: MergeSuggestion[]
  loading: boolean
  selectedEntity: Entity | null
  entityMentions: EntityMention[]

  fetchEntities: (projectId: string, filters?: { type?: string; status?: string }) => Promise<void>
  fetchMergeSuggestions: (projectId: string) => Promise<void>
  confirmEntity: (projectId: string, entityId: string) => Promise<void>
  dismissEntity: (projectId: string, entityId: string) => Promise<void>
  mergeEntities: (projectId: string, entityAId: string, entityBId: string) => Promise<void>
  fetchEntityDetail: (projectId: string, entityId: string) => Promise<void>
  createEntity: (projectId: string, entityType: EntityType, structuredFields: Record<string, unknown>, branchContext?: { branchId: string; layer: 'branch' | 'main' }) => Promise<Entity | null>
  updateEntity: (entityId: string, updates: { canonical_name?: string; description?: string | null; structured_fields?: Record<string, unknown>; attributes?: Record<string, unknown> }, branchContext?: { branchId: string; sourceEntityId: string }) => Promise<boolean>
  deleteEntity: (entityId: string, branchContext?: { branchId: string; layer: 'branch' | 'main' }) => Promise<boolean>
}

export const useEntityStore = create<EntityState>((set, get) => ({
  entities: [],
  mergeSuggestions: [],
  loading: false,
  selectedEntity: null,
  entityMentions: [],

  fetchEntities: async (projectId, filters) => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      // Query from knowledge_entities (Gemini-based knowledge layer)
      let query = supabase
        .from('knowledge_entities')
        .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, source, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('layer', 'main')
        .order('canonical_name')

      if (filters?.type) {
        query = query.eq('entity_type', filters.type)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch entities:', error)
        set({ entities: [] })
      } else {
        // Fetch aliases for all retrieved entities
        const entityIds = (data || []).map((e: Record<string, unknown>) => e.id as string)
        let aliasMap = new Map<string, string[]>()
        if (entityIds.length > 0) {
          const { data: aliasData } = await supabase
            .from('knowledge_entity_aliases')
            .select('entity_id, alias')
            .in('entity_id', entityIds)
          if (aliasData) {
            for (const row of aliasData) {
              const list = aliasMap.get(row.entity_id) || []
              list.push(row.alias)
              aliasMap.set(row.entity_id, list)
            }
          }
        }

        // Map knowledge_entities format to Entity interface
        const mapped: Entity[] = (data || []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          name: e.canonical_name as string,
          entity_type: e.entity_type as string,
          status: 'confirmed',
          aliases: aliasMap.get(e.id as string) || [],
          metadata: (e.attributes as Record<string, unknown>) || {},
          created_at: e.created_at as string,
          updated_at: e.updated_at as string,
          entity_types: e.entity_types as string[],
          description: e.description as string | null,
          attributes: (e.attributes as Record<string, unknown>) || {},
          structured_fields: (e.structured_fields as Record<string, unknown>) || {},
          source: (e.source as string) || 'ai',
        }))
        set({ entities: mapped })
      }
    } catch (error) {
      console.error('Failed to fetch entities:', error)
    } finally {
      set({ loading: false })
    }
  },

  fetchMergeSuggestions: async (_projectId) => {
    // Merge suggestions require server-side processing (deduplication logic).
    // On static hosting, this is a no-op. Suggestions only available with Express server.
    set({ mergeSuggestions: [] })
  },

  confirmEntity: async (_projectId, _entityId) => {
    // knowledge_entities does not have a status column yet — no-op
    console.log('[Knowledge] confirmEntity: status management not yet implemented for knowledge_entities')
  },

  dismissEntity: async (_projectId, entityId) => {
    // For now, remove from local state only (knowledge_entities has no status column)
    set({ entities: get().entities.filter(e => e.id !== entityId) })
  },

  mergeEntities: async (projectId, _entityAId, _entityBId) => {
    // Merge requires server-side logic. No-op on static hosting.
    // Refresh to show current state
    await get().fetchEntities(projectId)
  },

  fetchEntityDetail: async (_projectId, entityId) => {
    try {
      const { data: entity } = await supabase
        .from('knowledge_entities')
        .select('*')
        .eq('id', entityId)
        .single()

      const { data: mentions } = await supabase
        .from('knowledge_entity_mentions')
        .select('id, chunk_position, evidence, created_at')
        .eq('entity_id', entityId)
        .order('chunk_position')

      // Map to Entity interface
      const mappedEntity: Entity | null = entity ? {
        id: entity.id,
        name: entity.canonical_name,
        entity_type: entity.entity_type,
        status: 'confirmed',
        aliases: [],
        metadata: entity.attributes || {},
        created_at: entity.created_at,
        updated_at: entity.updated_at,
        entity_types: entity.entity_types,
        description: entity.description,
        attributes: entity.attributes,
        structured_fields: entity.structured_fields || {},
        source: entity.source || 'ai',
      } : null

      // Map mentions to EntityMention interface
      const mappedMentions: EntityMention[] = (mentions || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        context_snippet: (m.evidence as string) || '',
        mention_text: '',
        created_at: m.created_at as string,
        document_chunks: {
          id: '',
          chapter_number: null,
          chapter_title: null,
          page: null,
          position: m.chunk_position as number,
        },
      }))

      set({
        selectedEntity: mappedEntity,
        entityMentions: mappedMentions,
      })
    } catch (error) {
      console.error('Failed to fetch entity detail:', error)
    }
  },

  // ==============================
  // Create a new entity manually
  // ==============================
  // If a branch is active (passed via branchContext), entity is created in branch.
  // Otherwise, entity is created in Main.
  createEntity: async (projectId, entityType, structuredFields, branchContext?: { branchId: string; layer: 'branch' | 'main' }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const name = (structuredFields.name as string) || 'ישות חדשה'
      const layer = branchContext?.layer || 'main'
      const branchId = branchContext?.branchId || null

      const { data, error } = await supabase
        .from('knowledge_entities')
        .insert({
          project_id: projectId,
          user_id: user.id,
          canonical_name: name,
          entity_type: entityType,
          entity_types: [entityType],
          description: (structuredFields.description as string) || null,
          attributes: {},
          structured_fields: structuredFields,
          layer,
          branch_id: branchId,
          source: 'user',
        })
        .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, source, created_at, updated_at')
        .single()

      if (error || !data) {
        console.error('Failed to create entity:', error)
        return null
      }

      const newEntity: Entity = {
        id: data.id,
        name: data.canonical_name,
        entity_type: data.entity_type,
        status: 'confirmed',
        aliases: [],
        metadata: data.attributes || {},
        created_at: data.created_at,
        updated_at: data.updated_at,
        entity_types: data.entity_types,
        description: data.description,
        attributes: data.attributes || {},
        structured_fields: data.structured_fields || {},
        source: data.source || 'user',
      }

      set({ entities: [...get().entities, newEntity] })
      return newEntity
    } catch (error) {
      console.error('Failed to create entity:', error)
      return null
    }
  },

  // ==============================
  // Update an existing entity
  // ==============================
  // If branchContext provided with sourceEntityId: create/update overlay in branch
  // Otherwise: update Main entity directly
  updateEntity: async (entityId, updates, branchContext?: { branchId: string; sourceEntityId: string }) => {
    try {
      if (branchContext) {
        // Branch mode: create overlay instead of updating Main
        const { branchId, sourceEntityId } = branchContext

        // Get current main entity to build base_values
        const { data: mainEntity } = await supabase
          .from('knowledge_entities')
          .select('*')
          .eq('id', sourceEntityId)
          .eq('layer', 'main')
          .single()

        if (!mainEntity) {
          console.error('Main entity not found for branch overlay')
          return false
        }

        // Check if overlay already exists
        const { data: existingOverlay } = await supabase
          .from('knowledge_branch_entities')
          .select('*')
          .eq('branch_id', branchId)
          .eq('source_entity_id', sourceEntityId)
          .maybeSingle()

        // Build overrides object (only changed fields)
        const overrides: Record<string, unknown> = existingOverlay?.overrides || {}

        if (updates.canonical_name !== undefined) {
          overrides['canonical_name'] = updates.canonical_name
        }
        if (updates.description !== undefined) {
          overrides['description'] = updates.description
        }
        if (updates.structured_fields) {
          for (const [key, value] of Object.entries(updates.structured_fields)) {
            overrides[`structured_fields.${key}`] = value
          }
        }
        if (updates.attributes) {
          for (const [key, value] of Object.entries(updates.attributes)) {
            overrides[`attributes.${key}`] = value
          }
        }

        // Build base_values if new overlay
        let baseValues = existingOverlay?.base_values || {}
        if (!existingOverlay) {
          baseValues = {
            canonical_name: mainEntity.canonical_name,
            entity_type: mainEntity.entity_type,
            description: mainEntity.description,
          }
          if (mainEntity.structured_fields) {
            for (const [key, value] of Object.entries(mainEntity.structured_fields)) {
              baseValues[`structured_fields.${key}`] = value
            }
          }
          if (mainEntity.attributes) {
            for (const [key, value] of Object.entries(mainEntity.attributes)) {
              baseValues[`attributes.${key}`] = value
            }
          }
        }

        if (existingOverlay) {
          // Update existing overlay
          const { error } = await supabase
            .from('knowledge_branch_entities')
            .update({
              overrides,
              is_modified: Object.keys(overrides).length > 0,
              modified_fields: Object.keys(overrides),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingOverlay.id)

          if (error) {
            console.error('Failed to update branch overlay:', error)
            return false
          }
        } else {
          // Create new overlay
          const { error } = await supabase
            .from('knowledge_branch_entities')
            .insert({
              branch_id: branchId,
              source_entity_id: sourceEntityId,
              entity_id: sourceEntityId,
              project_id: mainEntity.project_id,
              user_id: mainEntity.user_id,
              overrides,
              base_values: baseValues,
              is_modified: Object.keys(overrides).length > 0,
              modified_fields: Object.keys(overrides),
            })

          if (error) {
            console.error('Failed to create branch overlay:', error)
            return false
          }
        }

        return true
      } else {
        // Main mode: update Main entity directly
        const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }

        if (updates.canonical_name !== undefined) dbUpdates.canonical_name = updates.canonical_name
        if (updates.description !== undefined) dbUpdates.description = updates.description
        if (updates.structured_fields !== undefined) dbUpdates.structured_fields = updates.structured_fields
        if (updates.attributes !== undefined) dbUpdates.attributes = updates.attributes

        const { error } = await supabase
          .from('knowledge_entities')
          .update(dbUpdates)
          .eq('id', entityId)

        if (error) {
          console.error('Failed to update entity:', error)
          return false
        }

        // Update local state
        set({
          entities: get().entities.map(e => {
            if (e.id !== entityId) return e
            return {
              ...e,
              name: updates.canonical_name ?? e.name,
              description: updates.description !== undefined ? updates.description : e.description,
              structured_fields: updates.structured_fields ?? e.structured_fields,
              attributes: updates.attributes ?? e.attributes,
              metadata: updates.attributes ?? e.metadata,
              updated_at: new Date().toISOString(),
            }
          }),
          selectedEntity: get().selectedEntity?.id === entityId
            ? {
                ...get().selectedEntity!,
                name: updates.canonical_name ?? get().selectedEntity!.name,
                description: updates.description !== undefined ? updates.description : get().selectedEntity!.description,
                structured_fields: updates.structured_fields ?? get().selectedEntity!.structured_fields,
                attributes: updates.attributes ?? get().selectedEntity!.attributes,
                updated_at: new Date().toISOString(),
              }
            : get().selectedEntity,
        })
        return true
      }
    } catch (error) {
      console.error('Failed to update entity:', error)
      return false
    }
  },

  // ==============================
  // Delete an entity
  // ==============================
  // Only allow delete if:
  // - branchContext provided with layer='branch' (delete branch-only or overlay), OR
  // - Entity is branch-only and no reference from Main
  // Prevent hard delete of Main entities
  deleteEntity: async (entityId, branchContext?: { branchId: string; layer: 'branch' | 'main' }) => {
    try {
      if (branchContext?.layer === 'branch') {
        // Branch deletion allowed
        // If it's a branch-only entity, delete directly
        // If it's an overlay, delete the overlay record
        const { data: entity } = await supabase
          .from('knowledge_entities')
          .select('layer, branch_id')
          .eq('id', entityId)
          .single()

        if (entity?.layer === 'branch') {
          // Branch-only entity: safe to delete
          const { error } = await supabase
            .from('knowledge_entities')
            .delete()
            .eq('id', entityId)

          if (error) {
            console.error('Failed to delete branch entity:', error)
            return false
          }
        } else {
          // Overlay: delete from knowledge_branch_entities
          const { error } = await supabase
            .from('knowledge_branch_entities')
            .delete()
            .eq('branch_id', branchContext.branchId)
            .eq('source_entity_id', entityId)

          if (error) {
            console.error('Failed to delete branch overlay:', error)
            return false
          }
        }

        set({
          entities: get().entities.filter(e => e.id !== entityId),
          selectedEntity: get().selectedEntity?.id === entityId ? null : get().selectedEntity,
        })
        return true
      } else {
        // Main deletion: blocked for safety
        console.warn('Cannot hard-delete Main entity. Use archive or branch deletion instead.')
        return false
      }
    } catch (error) {
      console.error('Failed to delete entity:', error)
      return false
    }
  },
}))
