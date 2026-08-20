import { create } from 'zustand'

export interface Contradiction {
  id: string
  entity_id: string
  contradiction_type: string
  status: string
  description: string | null
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  // Legacy columns for attribute-based contradictions
  attribute_a_id: string | null
  attribute_b_id: string | null
  // Related data (from joins)
  entity?: {
    id: string
    name: string
    entity_type: string
  }
  attribute_a?: {
    id: string
    attribute_name: string
    attribute_value: string
    source_chunk_id: string | null
  }
  attribute_b?: {
    id: string
    attribute_name: string
    attribute_value: string
    source_chunk_id: string | null
  }
}

interface ContradictionState {
  contradictions: Contradiction[]
  loading: boolean
  available: boolean

  fetchContradictions: (projectId: string, status?: string) => Promise<void>
  resolveContradiction: (contradictionId: string, status: string, note?: string) => Promise<void>
}

export const useContradictionStore = create<ContradictionState>((set) => ({
  contradictions: [],
  loading: false,
  available: false,

  fetchContradictions: async (_projectId, _status) => {
    // Contradictions are temporarily unavailable until the canonical
    // knowledge_contradictions migration is deployed. Do not query the
    // removed legacy entities/contradictions tables here.
    set({ loading: true, contradictions: [], available: false })
    set({ loading: false })
  },

  resolveContradiction: async (_contradictionId, _status, _note) => {
    // Resolution remains disabled until canonical contradiction storage is available.
  },
}))
