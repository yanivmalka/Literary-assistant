import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface DocumentVersion {
  id: string
  version_number: number
  status: string
  file_size: number | null
  error_message: string | null
  error_stage: string | null
  processing_started_at: string | null
  processing_completed_at: string | null
  created_at: string
}

export interface Document {
  id: string
  name: string
  file_type: string
  created_at: string
  updated_at: string
  version_count: number
  latest_version: DocumentVersion | null
}

interface DocumentState {
  documents: Document[]
  loading: boolean
  uploading: boolean
  uploadProgress: number
  pollingInterval: ReturnType<typeof setInterval> | null

  fetchDocuments: (projectId: string) => Promise<void>
  uploadDocument: (projectId: string, file: File, documentId?: string) => Promise<{ success: boolean; error?: string }>
  deleteDocument: (projectId: string, documentId: string) => Promise<void>
  reprocessVersion: (projectId: string, documentId: string, versionId: string, fromStage?: string) => Promise<void>
  startPolling: (projectId: string) => void
  stopPolling: () => void
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { 'Authorization': `Bearer ${session.access_token}` }
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  loading: false,
  uploading: false,
  uploadProgress: 0,
  pollingInterval: null,

  fetchDocuments: async (projectId: string) => {
    set({ loading: true })
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`/api/projects/${projectId}/documents`, { headers })
      if (response.ok) {
        const data = await response.json()
        set({ documents: data.documents || [] })
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    } finally {
      set({ loading: false })
    }
  },

  uploadDocument: async (projectId: string, file: File, documentId?: string) => {
    set({ uploading: true, uploadProgress: 0 })
    try {
      const headers = await getAuthHeaders()
      const formData = new FormData()
      formData.append('file', file)
      if (documentId) {
        formData.append('document_id', documentId)
      }

      const response = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        set({ uploading: false })
        return { success: false, error: error.error || 'Upload failed' }
      }

      set({ uploading: false, uploadProgress: 100 })

      // Refresh document list
      await get().fetchDocuments(projectId)
      return { success: true }
    } catch (error) {
      set({ uploading: false })
      return { success: false, error: 'Network error during upload' }
    }
  },

  deleteDocument: async (projectId: string, documentId: string) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/documents/${documentId}`, {
        method: 'DELETE',
        headers,
      })
      set({ documents: get().documents.filter(d => d.id !== documentId) })
    } catch (error) {
      console.error('Failed to delete document:', error)
    }
  },

  reprocessVersion: async (projectId: string, documentId: string, versionId: string, fromStage?: string) => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/projects/${projectId}/documents/${documentId}/versions/${versionId}/reprocess`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_stage: fromStage }),
      })
      await get().fetchDocuments(projectId)
    } catch (error) {
      console.error('Failed to reprocess:', error)
    }
  },

  startPolling: (projectId: string) => {
    get().stopPolling()
    const interval = setInterval(() => {
      get().fetchDocuments(projectId)
    }, 3000)
    set({ pollingInterval: interval })
  },

  stopPolling: () => {
    const { pollingInterval } = get()
    if (pollingInterval) {
      clearInterval(pollingInterval)
      set({ pollingInterval: null })
    }
  },
}))
