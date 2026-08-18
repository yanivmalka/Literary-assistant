import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Entity {
  id: string
  name: string
  entity_type: string
  status: string
  aliases: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // New knowledge layer fields
  entity_types?: string[]
  description?: string | null
  attributes?: Record<string, unknown>
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

      // Query from knowledge_entities (new Gemini-based knowledge layer)
      let query = supabase
        .from('knowledge_entities')
        .select('id, canonical_name, entity_type, entity_types, description, attributes, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('canonical_name')

      if (filters?.type) {
        query = query.eq('entity_type', filters.type)
      }
      // Note: knowledge_entities doesn't have 'status' column yet — filter ignored

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch entities:', error)
        set({ entities: [] })
      } else {
        // Map knowledge_entities format to Entity interface
        const mapped: Entity[] = (data || []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          name: e.canonical_name as string,
          entity_type: e.entity_type as string,
          status: 'confirmed',
          aliases: [],
          metadata: (e.attributes as Record<string, unknown>) || {},
          created_at: e.created_at as string,
          updated_at: e.updated_at as string,
          entity_types: e.entity_types as string[],
          description: e.description as string | null,
          attributes: (e.attributes as Record<string, unknown>) || {},
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
}))
