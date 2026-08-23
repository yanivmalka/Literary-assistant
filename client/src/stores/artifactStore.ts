import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export type ExpertArtifactStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface ExpertArtifact {
  id: string
  project_id: string
  document_id: string
  version_id: string
  extraction_run_id: string
  branch_id: string | null
  model_profile: string
  role: 'characters' | 'locations' | 'events'
  window_id: string
  offset: number
  chunk_limit: number
  chunk_positions: number[]
  status: ExpertArtifactStatus
  attempt: number
  model: string | null
  parsed_response: Record<string, unknown> | null
  error_message: string | null
  input_tokens: number | null
  output_tokens: number | null
  thinking_tokens: number | null
  total_tokens: number | null
  latency_ms: number | null
  created_at: string
  updated_at: string
}

export interface ArtifactSourceChunk {
  id: string
  content: string
  chapter_number: number | null
  chapter_title: string | null
  page: number | null
  position: number
}

interface ArtifactState {
  artifacts: ExpertArtifact[]
  sourcesByArtifactId: Record<string, ArtifactSourceChunk[]>
  loading: boolean
  error: string | null
  fetchArtifacts: (projectId: string) => Promise<void>
  fetchArtifactSources: (artifact: ExpertArtifact) => Promise<ArtifactSourceChunk[]>
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  artifacts: [],
  sourcesByArtifactId: {},
  loading: false,
  error: null,

  fetchArtifacts: async (projectId) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('extraction_expert_artifacts')
      .select(`
        id, project_id, document_id, version_id, extraction_run_id, branch_id,
        model_profile, role, window_id, offset, chunk_limit, chunk_positions,
        status, attempt, model, parsed_response, error_message,
        input_tokens, output_tokens, thinking_tokens, total_tokens, latency_ms,
        created_at, updated_at
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      set({ artifacts: [], loading: false, error: error.message })
      return
    }

    const artifacts = ((data ?? []) as ExpertArtifact[]).map(artifact => ({
      ...artifact,
      chunk_positions: Array.isArray(artifact.chunk_positions)
        ? artifact.chunk_positions.filter(position => Number.isInteger(position))
        : [],
    }))
    set({ artifacts, loading: false })
  },

  fetchArtifactSources: async (artifact) => {
    const positions = artifact.chunk_positions.filter(position => Number.isInteger(position))
    if (positions.length === 0) {
      set(state => ({
        sourcesByArtifactId: { ...state.sourcesByArtifactId, [artifact.id]: [] },
      }))
      return []
    }

    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, content, chapter_number, chapter_title, page, position')
      .eq('version_id', artifact.version_id)
      .in('position', positions)
      .order('position', { ascending: true })

    if (error) {
      set({ error: error.message })
      return []
    }

    const sources = (data ?? []) as ArtifactSourceChunk[]
    set(state => ({
      sourcesByArtifactId: { ...state.sourcesByArtifactId, [artifact.id]: sources },
    }))
    return sources
  },
}))
