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

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { 'Authorization': `Bearer ${session.access_token}` }
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
      const headers = await getAuthHeaders()
      const params = new URLSearchParams()
      if (filters?.type) params.set('type', filters.type)
      if (filters?.status) params.set('status', filters.status)
      const url = `/api/projects/${projectId}/entities${params.toString() ? '?' + params.toString() : ''}`

      const response = await fetch(url, { headers })
      if (response.ok) {
        const data = await response.json()
        set({ entities: data.entities || [] })
      }
    } catch (error) {
      console.error('Failed to fetch entities:', error)
    } finally {
      set({ loading: false })
    }
  },

  fetchMergeSuggestions: async (projectId) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`/api/projects/${projectId}/entities/suggestions/merge`, { headers })
      if (response.ok) {
        const data = await response.json()
        set({ mergeSuggestions: data.suggestions || [] })
      }
    } catch (error) {
      console.error('Failed to fetch merge suggestions:', error)
    }
  },

  confirmEntity: async (projectId, entityId) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/entities/${entityId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })
      set({
        entities: get().entities.map(e =>
          e.id === entityId ? { ...e, status: 'confirmed' } : e
        ),
      })
    } catch (error) {
      console.error('Failed to confirm entity:', error)
    }
  },

  dismissEntity: async (projectId, entityId) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/entities/${entityId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      })
      set({
        entities: get().entities.filter(e => e.id !== entityId),
      })
    } catch (error) {
      console.error('Failed to dismiss entity:', error)
    }
  },

  mergeEntities: async (projectId, entityAId, entityBId) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/entities/merge`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_a_id: entityAId, entity_b_id: entityBId }),
      })
      // Refresh entities and suggestions
      await get().fetchEntities(projectId)
      await get().fetchMergeSuggestions(projectId)
    } catch (error) {
      console.error('Failed to merge entities:', error)
    }
  },

  fetchEntityDetail: async (projectId, entityId) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`/api/projects/${projectId}/entities/${entityId}`, { headers })
      if (response.ok) {
        const data = await response.json()
        set({
          selectedEntity: data.entity,
          entityMentions: data.mentions || [],
        })
      }
    } catch (error) {
      console.error('Failed to fetch entity detail:', error)
    }
  },
}))
