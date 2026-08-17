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

      let query = supabase
        .from('entities')
        .select('id, name, entity_type, status, aliases, metadata, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .neq('status', 'merged')
        .order('name')

      if (filters?.type) {
        query = query.eq('entity_type', filters.type)
      }
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch entities:', error)
        set({ entities: [] })
      } else {
        set({ entities: (data as Entity[]) || [] })
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

  confirmEntity: async (_projectId, entityId) => {
    try {
      const { error } = await supabase
        .from('entities')
        .update({ status: 'confirmed' })
        .eq('id', entityId)

      if (!error) {
        set({
          entities: get().entities.map(e =>
            e.id === entityId ? { ...e, status: 'confirmed' } : e
          ),
        })
      }
    } catch (error) {
      console.error('Failed to confirm entity:', error)
    }
  },

  dismissEntity: async (_projectId, entityId) => {
    try {
      const { error } = await supabase
        .from('entities')
        .update({ status: 'dismissed' })
        .eq('id', entityId)

      if (!error) {
        set({
          entities: get().entities.filter(e => e.id !== entityId),
        })
      }
    } catch (error) {
      console.error('Failed to dismiss entity:', error)
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
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .single()

      const { data: mentions } = await supabase
        .from('entity_mentions')
        .select(`
          id, context_snippet, mention_text, created_at,
          document_chunks (id, chapter_number, chapter_title, page, position)
        `)
        .eq('entity_id', entityId)
        .order('created_at')

      set({
        selectedEntity: entity as Entity | null,
        entityMentions: (mentions as unknown as EntityMention[]) || [],
      })
    } catch (error) {
      console.error('Failed to fetch entity detail:', error)
    }
  },
}))
