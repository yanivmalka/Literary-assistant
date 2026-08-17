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

export const useContradictionStore = create<ContradictionState>((set, get) => ({
  contradictions: [],
  loading: false,

  fetchContradictions: async (projectId, status) => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      // Get entity IDs for this project
      const { data: entities } = await supabase
        .from('entities')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)

      if (!entities || entities.length === 0) {
        set({ contradictions: [], loading: false })
        return
      }

      const entityIds = entities.map(e => e.id)

      let query = supabase
        .from('contradictions')
        .select(`
          id, contradiction_type, status, description, resolution_note, created_at, resolved_at,
          entities (id, name, entity_type),
          attribute_a:attribute_a_id (id, attribute_name, attribute_value, source_chunk_id),
          attribute_b:attribute_b_id (id, attribute_name, attribute_value, source_chunk_id)
        `)
        .in('entity_id', entityIds)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch contradictions:', error)
        set({ contradictions: [] })
      } else {
        set({ contradictions: (data as unknown as Contradiction[]) || [] })
      }
    } catch (error) {
      console.error('Failed to fetch contradictions:', error)
    } finally {
      set({ loading: false })
    }
  },

  resolveContradiction: async (_projectId, contradictionId, status, note) => {
    try {
      const { error } = await supabase
        .from('contradictions')
        .update({
          status,
          resolution_note: note || null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', contradictionId)

      if (!error) {
        set({
          contradictions: get().contradictions.map(c =>
            c.id === contradictionId ? { ...c, status, resolution_note: note || null } : c
          ),
        })
      }
    } catch (error) {
      console.error('Failed to resolve contradiction:', error)
    }
  },
}))
