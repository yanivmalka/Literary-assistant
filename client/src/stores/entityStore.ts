import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { type EntityType } from '@/lib/entityTypes'
import type { ExtractionModelProfile } from '@/lib/extractionModels'

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
  review_status?: 'pending' | 'confirmed' | 'dismissed' | 'merged'
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
  // Cached dataset snapshots for version-aware selectors
  mainEntitiesCache: Entity[] | null
  branchEntitiesCache: Entity[] | null

  fetchEntities: (projectId: string, filters?: { type?: string; status?: string }, profile?: ExtractionModelProfile) => Promise<void>
  fetchMergeSuggestions: (projectId: string) => Promise<void>
  confirmEntity: (projectId: string, entityId: string) => Promise<void>
  dismissEntity: (projectId: string, entityId: string) => Promise<void>
  mergeEntities: (projectId: string, entityAId: string, entityBId: string) => Promise<void>
  updateReviewStatus: (projectId: string, entityId: string, reviewStatus: 'confirmed' | 'dismissed' | 'pending') => Promise<void>
  fetchEntityDetail: (projectId: string, entityId: string) => Promise<void>
  createEntity: (projectId: string, entityType: EntityType, structuredFields: Record<string, unknown>, branchContext?: { branchId: string; layer: 'branch' | 'main' }) => Promise<Entity | null>
  updateEntity: (entityId: string, updates: { canonical_name?: string; description?: string | null; structured_fields?: Record<string, unknown>; attributes?: Record<string, unknown> }, branchContext?: { branchId: string; sourceEntityId: string }) => Promise<boolean>
  deleteEntity: (entityId: string, branchContext?: { branchId: string; layer: 'branch' } | { layer: 'main' }) => Promise<boolean>
  getMainOnlyEntities: (filters?: { type?: string; status?: string }) => Entity[]
  getEffectiveBranchEntities: (filters?: { type?: string; status?: string }) => Entity[]
}

export const useEntityStore = create<EntityState>((set, get) => ({
  entities: [],
  mergeSuggestions: [],
  loading: false,
  selectedEntity: null,
  entityMentions: [],
  mainEntitiesCache: null,
  branchEntitiesCache: null,

  fetchEntities: async (projectId, filters, profile = 'sub-base') => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      // Import branchView utilities for overlay merging
      const { getEffectiveBranchView, getEffectiveBranchOnlyView } = await import('@/lib/branchView')

      // Step 1: Fetch Main layer entities
      let mainQuery = supabase
        .from('knowledge_entities')
        .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, source, review_status, created_at, updated_at, project_id, user_id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('layer', 'main')
        .order('canonical_name')

      const { data: mainEntities, error: mainError } = await mainQuery

      if (mainError) {
        console.error('Failed to fetch main entities:', mainError)
        set({ entities: [], mainEntitiesCache: [], branchEntitiesCache: [] })
        return
      }

      // Step 2: Get active branch for this project
      const { data: activeBranch } = await supabase
        .from('knowledge_branches')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('profile', profile)
        .eq('is_current', true)
        .eq('status', 'active')
        .maybeSingle()

      // Step 3: Fetch branch overlays if active branch exists
      let branchOverlays: Array<any> = []
      let branchOnlyEntities: Array<any> = []
      
      if (activeBranch?.id) {
        // Fetch overlays (Main entities with Branch modifications)
        const { data: overlays } = await supabase
          .from('knowledge_branch_entities')
          .select('id, branch_id, source_entity_id, entity_id, overrides, base_values, is_modified, modified_fields, created_at, updated_at')
          .eq('branch_id', activeBranch.id)

        if (overlays) {
          branchOverlays = overlays
        }

        // Fetch branch-only entities (layer='branch', no Main parent)
        const { data: branchOnly } = await supabase
          .from('knowledge_entities')
          .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, source, review_status, created_at, updated_at, project_id, user_id, branch_id')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .eq('layer', 'branch')
          .eq('branch_id', activeBranch.id)
          .order('canonical_name')

        if (branchOnly) {
          branchOnlyEntities = branchOnly
        }
      }

      // Step 4: Fetch aliases for all entities with branch scope
      // Build separate maps for Main and Branch aliases keyed by (entity_id, branch_id)
      const allEntityIds = new Set<string>()
      mainEntities?.forEach(e => allEntityIds.add(e.id as string))
      branchOnlyEntities.forEach(e => allEntityIds.add(e.id as string))
      
      // Maps keyed by "entity_id" for Main, "entity_id::branch_id" for Branch
      let aliasMap = new Map<string, string[]>()
      if (allEntityIds.size > 0) {
        // Fetch Main aliases (no branch_id)
        const { data: mainAliasData } = await supabase
          .from('knowledge_entity_aliases')
          .select('entity_id, alias, branch_id')
          .in('entity_id', Array.from(allEntityIds))
          .is('branch_id', null)  // Main aliases have null branch_id
        
        if (mainAliasData) {
          for (const row of mainAliasData) {
            const list = aliasMap.get(row.entity_id) || []
            list.push(row.alias)
            aliasMap.set(row.entity_id, list)
          }
        }

        // Fetch Branch aliases (scoped by branch_id)
        if (activeBranch?.id) {
          const { data: branchAliasData } = await supabase
            .from('knowledge_entity_aliases')
            .select('entity_id, alias, branch_id')
            .in('entity_id', Array.from(allEntityIds))
            .eq('branch_id', activeBranch.id)
          
          if (branchAliasData) {
            for (const row of branchAliasData) {
              // Key Branch aliases by (entity_id, branch_id) tuple
              const key = `${row.entity_id}::${row.branch_id}`
              const list = aliasMap.get(key) || []
              list.push(row.alias)
              aliasMap.set(key, list)
            }
          }
        }
      }

      // ============================================
      // Build Main-only dataset (no Branch overlays)
      // ============================================
      const mainOnlyEntities = new Map<string, Entity>()

      if (mainEntities) {
        for (const mainEntity of mainEntities) {
          const mainId = mainEntity.id as string

          const effectiveData = {
            id: mainId,
            canonical_name: mainEntity.canonical_name as string,
            entity_type: mainEntity.entity_type as string,
            description: mainEntity.description as string | null,
            attributes: mainEntity.attributes as Record<string, unknown> || {},
            structured_fields: mainEntity.structured_fields as Record<string, unknown> || {},
            review_status: (mainEntity.review_status as string) || 'pending',
            created_at: mainEntity.created_at as string,
            updated_at: mainEntity.updated_at as string,
          }

          const entity: Entity = {
            id: effectiveData.id,
            name: effectiveData.canonical_name,
            entity_type: effectiveData.entity_type,
            status: 'confirmed',
            aliases: aliasMap.get(mainId) || [],
            metadata: effectiveData.attributes,
            created_at: effectiveData.created_at,
            updated_at: effectiveData.updated_at,
            entity_types: (mainEntity.entity_types as string[]) || [mainEntity.entity_type as string],
            description: effectiveData.description,
            attributes: effectiveData.attributes,
            structured_fields: effectiveData.structured_fields,
            source: (mainEntity.source as string) || 'ai',
            review_status: effectiveData.review_status as 'pending' | 'confirmed' | 'dismissed' | 'merged',
          }

          mainOnlyEntities.set(mainId, entity)
        }
      }

      // ============================================
      // Build effective Branch dataset (Main + Overlays + Branch-only)
      // ============================================
      const effectiveEntities = new Map<string, Entity>()

      // Add Main entities with Branch overlays applied
      if (mainEntities) {
        for (const mainEntity of mainEntities) {
          const mainId = mainEntity.id as string
          const overlay = branchOverlays.find(o => o.entity_id === mainId || o.source_entity_id === mainId)

          let effectiveData
          if (overlay && activeBranch?.id) {
            // Apply Branch overrides to Main entity
            effectiveData = getEffectiveBranchView(
              mainEntity as any,
              overlay as any,
              activeBranch.id
            )
          } else {
            // No Branch modifications, use Main as-is
            effectiveData = {
              id: mainId,
              canonical_name: mainEntity.canonical_name as string,
              entity_type: mainEntity.entity_type as string,
              description: mainEntity.description as string | null,
              attributes: mainEntity.attributes as Record<string, unknown> || {},
              structured_fields: mainEntity.structured_fields as Record<string, unknown> || {},
              review_status: (mainEntity.review_status as string) || 'pending',
              created_at: mainEntity.created_at as string,
              updated_at: mainEntity.updated_at as string,
            }
          }

          const entity: Entity = {
            id: effectiveData.id,
            name: effectiveData.canonical_name,
            entity_type: effectiveData.entity_type,
            status: 'confirmed',
            aliases: (activeBranch?.id ? aliasMap.get(`${mainId}::${activeBranch.id}`) : null) || aliasMap.get(mainId) || [],
            metadata: effectiveData.attributes,
            created_at: effectiveData.created_at,
            updated_at: effectiveData.updated_at,
            entity_types: (mainEntity.entity_types as string[]) || [mainEntity.entity_type as string],
            description: effectiveData.description,
            attributes: effectiveData.attributes,
            structured_fields: effectiveData.structured_fields,
            source: (mainEntity.source as string) || 'ai',
            review_status: effectiveData.review_status as 'pending' | 'confirmed' | 'dismissed' | 'merged',
          }

          effectiveEntities.set(mainId, entity)
        }
      }

      // Add branch-only entities
      for (const branchEntity of branchOnlyEntities) {
        const branchId = branchEntity.id as string
        const branchContextId = activeBranch?.id || branchEntity.branch_id as string
        const effectiveData = getEffectiveBranchOnlyView(
          branchEntity as any,
          branchContextId
        )

        const entity: Entity = {
          id: effectiveData.id,
          name: effectiveData.canonical_name,
          entity_type: effectiveData.entity_type,
          status: 'confirmed',
          aliases: (branchContextId ? aliasMap.get(`${branchId}::${branchContextId}`) : null) || aliasMap.get(branchId) || [],
          metadata: effectiveData.attributes,
          created_at: effectiveData.created_at,
          updated_at: effectiveData.updated_at,
          entity_types: (branchEntity.entity_types as string[]) || [branchEntity.entity_type as string],
          description: effectiveData.description,
          attributes: effectiveData.attributes,
          structured_fields: effectiveData.structured_fields,
          source: (branchEntity.source as string) || 'ai',
        }

        effectiveEntities.set(branchId, entity)
      }

      // Step 5: Apply type filter if provided (to both datasets)
      let mainFiltered = Array.from(mainOnlyEntities.values())
      let effectiveFiltered = Array.from(effectiveEntities.values())
      
      if (filters?.type) {
        mainFiltered = mainFiltered.filter(e => e.entity_type === filters.type)
        effectiveFiltered = effectiveFiltered.filter(e => e.entity_type === filters.type)
      }

      set({ 
        entities: effectiveFiltered,
        mainEntitiesCache: mainFiltered,
        branchEntitiesCache: effectiveFiltered,
      })
    } catch (error) {
      console.error('Failed to fetch entities:', error)
      set({ entities: [], mainEntitiesCache: [], branchEntitiesCache: [] })
    } finally {
      set({ loading: false })
    }
  },

  fetchMergeSuggestions: async (_projectId) => {
    // Merge suggestions require server-side processing (deduplication logic).
    // On static hosting, this is a no-op. Suggestions only available with Express server.
    set({ mergeSuggestions: [] })
  },

  confirmEntity: async (projectId, entityId) => {
    await get().updateReviewStatus(projectId, entityId, 'confirmed')
  },

  dismissEntity: async (_projectId, entityId) => {
    await get().updateReviewStatus(_projectId, entityId, 'dismissed')
  },

  updateReviewStatus: async (_projectId, entityId, reviewStatus) => {
    try {
      const { error } = await supabase
        .from('knowledge_entities')
        .update({ review_status: reviewStatus })
        .eq('id', entityId)

      if (!error) {
        set({
          entities: get().entities.map(e =>
            e.id === entityId ? { ...e, review_status: reviewStatus } : e
          ),
          selectedEntity: get().selectedEntity?.id === entityId
            ? { ...get().selectedEntity!, review_status: reviewStatus }
            : get().selectedEntity,
        })
      }
    } catch (error) {
      console.error('Failed to update review status:', error)
    }
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
        review_status: entity.review_status || 'pending',
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

      // canonical_name is a display attribute. Every creation receives a new
      // UUID from the database, even when another entity has the same name.
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
          review_status: 'confirmed',  // User-created entities start as confirmed
        })
        .select('id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, source, review_status, created_at, updated_at')
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
        review_status: data.review_status || 'confirmed',
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
          // Include required legacy columns from Main entity to satisfy schema NOT NULL constraints
          // The edited values remain in overrides; base columns preserve Main/source values
          const { error } = await supabase
            .from('knowledge_branch_entities')
            .insert({
              branch_id: branchId,
              source_entity_id: sourceEntityId,
              entity_id: sourceEntityId,
              project_id: mainEntity.project_id,
              user_id: mainEntity.user_id,
              // Required legacy columns: use Main entity as source to preserve Main/Branch distinction
              canonical_name: mainEntity.canonical_name,
              entity_type: mainEntity.entity_type,
              entity_types: mainEntity.entity_types || [],
              description: mainEntity.description || null,
              attributes: mainEntity.attributes || {},
              // Overlay model columns: contain user's Branch changes
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
  // - branchContext provided with layer='main' (delete a canonical Main entity)
  deleteEntity: async (entityId, branchContext?: { branchId: string; layer: 'branch' } | { layer: 'main' }) => {
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
      } else if (branchContext?.layer === 'main') {
        const { error } = await supabase
          .from('knowledge_entities')
          .delete()
          .eq('id', entityId)
          .eq('layer', 'main')

        if (error) {
          console.error('Failed to delete Main entity:', error)
          return false
        }

        set({
          entities: get().entities.filter(e => e.id !== entityId),
          selectedEntity: get().selectedEntity?.id === entityId ? null : get().selectedEntity,
        })
        return true
      } else {
        // Main deletion requires explicit layer context for safety
        console.warn('Cannot delete entity without an explicit layer context.')
        return false
      }
    } catch (error) {
      console.error('Failed to delete entity:', error)
      return false
    }
  },

  // ==============================
  // Get Main-only entities (no Branch overlays)
  // ==============================
  // Returns canonical Main dataset without any Branch modifications
  // Useful when selectedVersion === 'main'
  getMainOnlyEntities: (filters?: { type?: string; status?: string }) => {
    const cache = get().mainEntitiesCache
    if (!cache) return []
    
    let result = [...cache]
    if (filters?.type) {
      result = result.filter(e => e.entity_type === filters.type)
    }
    return result
  },

  // ==============================
  // Get effective Branch entities (Main + Overlays + Branch-only)
  // ==============================
  // Returns entities with Branch overlays applied
  // Useful when selectedVersion === 'branch'
  getEffectiveBranchEntities: (filters?: { type?: string; status?: string }) => {
    const cache = get().branchEntitiesCache
    if (!cache) return []
    
    let result = [...cache]
    if (filters?.type) {
      result = result.filter(e => e.entity_type === filters.type)
    }
    return result
  },
}))
