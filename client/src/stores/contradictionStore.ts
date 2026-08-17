import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Contradiction {
  id: string
  contradiction_type: string
  status: string
  description: string | null
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  entities: { id: string; name: string; entity_type: string } | null
  attribute_a: { id: string; attribute_name: string; attribute_value: string; source_chunk_id: string | null } | null
  attribute_b: { id: string; attribute_name: string; attribute_value: string; source_chunk_id: string | null } | null
}

interface ContradictionState {
  contradictions: Contradiction[]
  loading: boolean

  fetchContradictions: (projectId: string, status?: string) => Promise<void>
  resolveContradiction: (projectId: string, contradictionId: string, status: string, note?: string) => Promise<void>
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { 'Authorization': `Bearer ${session.access_token}` }
}

export const useContradictionStore = create<ContradictionState>((set, get) => ({
  contradictions: [],
  loading: false,

  fetchContradictions: async (projectId, status) => {
    set({ loading: true })
    try {
      const headers = await getAuthHeaders()
      const params = status ? `?status=${status}` : ''
      const response = await fetch(`/api/projects/${projectId}/contradictions${params}`, { headers })
      if (response.ok) {
        const data = await response.json()
        set({ contradictions: data.contradictions || [] })
      }
    } catch (error) {
      console.error('Failed to fetch contradictions:', error)
    } finally {
      set({ loading: false })
    }
  },

  resolveContradiction: async (projectId, contradictionId, status, note) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/contradictions/${contradictionId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution_note: note }),
      })
      set({
        contradictions: get().contradictions.map(c =>
          c.id === contradictionId ? { ...c, status, resolution_note: note || null } : c
        ),
      })
    } catch (error) {
      console.error('Failed to resolve contradiction:', error)
    }
  },
}))
