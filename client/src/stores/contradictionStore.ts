import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Contradiction {
  id: string
  entity_id: string
  field_path: string
  value_a_id: string | null
  value_b_id: string | null
  contradiction_type: string
  status: string
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  branch_id: string | null
}

interface ContradictionState {
  contradictions: Contradiction[]
  loading: boolean

  fetchContradictions: (projectId: string, branchId?: string | null, status?: string) => Promise<void>
  resolveContradiction: (projectId: string, contradictionId: string, status: string, note?: string) => Promise<void>
}

export const useContradictionStore = create<ContradictionState>((set, get) => ({
  contradictions: [],
  loading: false,

  fetchContradictions: async (projectId, branchId, status) => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      let query = supabase
        .from('knowledge_contradictions')
        .select('id, entity_id, field_path, value_a_id, value_b_id, contradiction_type, status, resolution_note, created_at, resolved_at, branch_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      // Filter by branch if specified
      if (branchId) {
        query = query.eq('branch_id', branchId)
      } else {
        query = query.is('branch_id', null)
      }

      // Filter by status if specified
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
        .from('knowledge_contradictions')
        .update({
          status,
          resolution_note: note || null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', contradictionId)

      if (!error) {
        set({
          contradictions: get().contradictions.map(c =>
            c.id === contradictionId ? { ...c, status, resolution_note: note || null, resolved_at: new Date().toISOString() } : c
          ),
        })
      }
    } catch (error) {
      console.error('Failed to resolve contradiction:', error)
    }
  },
}))
