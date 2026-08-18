import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface DocumentVersion {
  id: string
  version_number: number
  status: string
  file_size: number | null
  error_message: string | null
  error_stage: string | null
  structure_metadata: Record<string, unknown> | null
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
  startPolling: (projectId: string) => void
  stopPolling: () => void
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
      // Fetch documents with their versions directly from Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      const { data: documents, error } = await supabase
        .from('documents')
        .select(`
          id, name, file_type, created_at, updated_at,
          document_versions (
            id, version_number, status, file_size, error_message, error_stage,
            structure_metadata, processing_started_at, processing_completed_at, created_at
          )
        `)
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error || !documents) {
        set({ documents: [], loading: false })
        return
      }

      const result: Document[] = documents.map(doc => {
        const versions = (doc.document_versions as DocumentVersion[]) || []
        const sorted = [...versions].sort((a, b) => b.version_number - a.version_number)
        const latest = sorted[0] || null

        return {
          id: doc.id,
          name: doc.name,
          file_type: doc.file_type,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          version_count: versions.length,
          latest_version: latest,
        }
      })

      set({ documents: result })
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    } finally {
      set({ loading: false })
    }
  },

  uploadDocument: async (projectId: string, file: File, documentId?: string) => {
    set({ uploading: true, uploadProgress: 0 })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ uploading: false })
        return { success: false, error: 'Not authenticated' }
      }

      const fileType = file.name.endsWith('.docx') ? 'docx' : 'pdf'
      let docId = documentId
      let versionNumber = 1

      if (docId) {
        // New version of existing document
        const { data: latestVersion } = await supabase
          .from('document_versions')
          .select('version_number')
          .eq('document_id', docId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single()

        versionNumber = (latestVersion?.version_number ?? 0) + 1
      } else {
        // Create new document record
        const { data: newDoc, error: createError } = await supabase
          .from('documents')
          .insert({
            project_id: projectId,
            user_id: user.id,
            name: file.name,
            file_type: fileType,
          })
          .select('id')
          .single()

        if (createError || !newDoc) {
          set({ uploading: false })
          return { success: false, error: 'Failed to create document record' }
        }
        docId = newDoc.id
      }

      // Upload to Supabase Storage
      // Sanitize filename: remove special chars, keep extension
      const ext = file.name.split('.').pop() || fileType
      const sanitizedName = `document_v${versionNumber}.${ext}`
      const storagePath = `${user.id}/${projectId}/${docId}/${versionNumber}/${sanitizedName}`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        // Clean up if new document
        if (!documentId) {
          await supabase.from('documents').delete().eq('id', docId)
        }
        set({ uploading: false })
        return { success: false, error: `Upload failed: ${uploadError.message}` }
      }

      // Create version record
      const { data: versionData, error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: docId,
          version_number: versionNumber,
          storage_path: storagePath,
          file_size: file.size,
          status: 'uploaded',
        })
        .select('id')
        .single()

      if (versionError || !versionData) {
        set({ uploading: false })
        return { success: false, error: 'Failed to create version record' }
      }

      // Trigger processing via Edge Function (background task)
      // Extracts text, detects structure, chunks the document.
      // Full-text search becomes available immediately after chunking.
      supabase.functions.invoke('process-document', {
        body: {
          version_id: versionData.id,
          document_id: docId,
          project_id: projectId,
        },
      }).catch((err) => {
        console.warn('Edge function trigger failed:', err)
      })

      set({ uploading: false, uploadProgress: 100 })
      await get().fetchDocuments(projectId)
      return { success: true }
    } catch (error) {
      set({ uploading: false })
      return { success: false, error: 'Unexpected error during upload' }
    }
  },

  deleteDocument: async (_projectId: string, documentId: string) => {
    try {
      // Get storage paths for cleanup
      const { data: versions } = await supabase
        .from('document_versions')
        .select('storage_path')
        .eq('document_id', documentId)

      if (versions && versions.length > 0) {
        const paths = versions.map(v => v.storage_path)
        await supabase.storage.from('project-documents').remove(paths)
      }

      await supabase.from('documents').delete().eq('id', documentId)
      set({ documents: get().documents.filter(d => d.id !== documentId) })
    } catch (error) {
      console.error('Failed to delete document:', error)
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
