import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { buildExtractionRequest, hasMainEntities, ensureMainBootstrapped, getOrCreateActiveBranch } from '@/lib/extractionBranching'

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

export interface ExtractionProgress {
  currentBatch: number
  totalChunks: number
  processedChunks: number
  entitiesSaved: number
  eventsSaved: number
}

interface DocumentState {
  documents: Document[]
  loading: boolean
  uploading: boolean
  uploadProgress: number
  pollingInterval: ReturnType<typeof setInterval> | null

  // Entity extraction state
  extractionInProgress: boolean
  extractionDone: boolean
  extractionCancelled: boolean
  extractionError: string | null
  extractionProgress: ExtractionProgress | null
  extractionDocumentId: string | null
  _extractionCancelFlag: boolean

  fetchDocuments: (projectId: string) => Promise<void>
  uploadDocument: (projectId: string, file: File, documentId?: string) => Promise<{ success: boolean; error?: string }>
  deleteDocument: (projectId: string, documentId: string) => Promise<void>
  triggerEntityExtraction: (versionId: string, projectId: string, documentId: string) => Promise<void>
  cancelExtraction: () => void
  dismissExtractionStatus: () => void
  startPolling: (projectId: string) => void
  stopPolling: () => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  loading: false,
  uploading: false,
  uploadProgress: 0,
  pollingInterval: null,

  // Entity extraction state
  extractionInProgress: false,
  extractionDone: false,
  extractionCancelled: false,
  extractionError: null,
  extractionProgress: null,
  extractionDocumentId: null,
  _extractionCancelFlag: false,

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
        // DIAGNOSTIC: Log any error response for 404 debugging
        if (error) {
          console.error('[DIAGNOSTIC] fetchDocuments() - SELECT error - operation: GET /rest/v1/documents - table: documents - projectId:', projectId, 'error_code:', error.code, 'error_message:', error.message, 'error_details:', error.details)
        } else {
          console.log('[DIAGNOSTIC] fetchDocuments() - No documents returned but no error - operation: GET /rest/v1/documents - projectId:', projectId)
        }
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
      console.error('[DIAGNOSTIC] fetchDocuments() - Catch error - operation: GET /rest/v1/documents - projectId:', projectId, 'error:', error)
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
        return { success: false, error: 'ui.common.notAuthenticated' }
      }

      const fileType = file.name.endsWith('.docx') ? 'docx' : 'pdf'
      let docId = documentId
      let versionNumber = 1

      if (docId) {
        // New version of existing document
        const { data: latestVersion, error: versionFetchError } = await supabase
          .from('document_versions')
          .select('version_number')
          .eq('document_id', docId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single()

        if (versionFetchError) {
          console.error('[DIAGNOSTIC] uploadDocument() - get latest version error - operation: GET /rest/v1/document_versions - documentId:', docId, 'error_code:', versionFetchError.code, 'error_message:', versionFetchError.message)
        }

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
          console.error('[DIAGNOSTIC] uploadDocument() - create document error - operation: POST /rest/v1/documents - projectId:', projectId, 'error_code:', createError?.code, 'error_message:', createError?.message)
          set({ uploading: false })
          return { success: false, error: 'ui.documents.uploadFailed' }
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
        console.error('[DIAGNOSTIC] uploadDocument() - storage upload error - operation: POST Storage project-documents - path:', storagePath, 'error_code:', uploadError.code, 'error_message:', uploadError.message)
        // Clean up if new document
        if (!documentId) {
          await supabase.from('documents').delete().eq('id', docId)
        }
        set({ uploading: false })
        return { success: false, error: 'ui.documents.uploadFailed' }
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
        console.error('[DIAGNOSTIC] uploadDocument() - create version error - operation: POST /rest/v1/document_versions - documentId:', docId, 'version:', versionNumber, 'error_code:', versionError?.code, 'error_message:', versionError?.message, 'UNIQUE_CONSTRAINT: (document_id, version_number)')
        set({ uploading: false })
        return { success: false, error: 'ui.documents.uploadFailed' }
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
      }).then(async () => {
        // Wait for Edge Function to finish chunking
        await new Promise(resolve => setTimeout(resolve, 5000))
        console.log('[Knowledge] Document processing complete. Use Extract Knowledge button to start extraction.')
      }).catch((err) => {
        console.error('[DIAGNOSTIC] uploadDocument() - process-document edge function error - operation: POST /functions/v1/process-document - error:', err)
        console.warn('Edge function trigger failed:', err)
      })

      set({ uploading: false, uploadProgress: 100 })
      await get().fetchDocuments(projectId)
      return { success: true }
    } catch (error) {
      console.error('[DIAGNOSTIC] uploadDocument() - catch error - error:', error)
      set({ uploading: false })
      return { success: false, error: 'ui.common.unexpectedError' }
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

  triggerEntityExtraction: async (versionId: string, projectId: string, documentId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let activeBranch: { id: string } | null = null
    let useMainForExtraction = false

    try {
      // Check if Main exists
      const mainExists = await hasMainEntities(projectId)

      if (!mainExists) {
        // Bootstrap: first extraction goes to Main
        console.log('[Knowledge] First extraction - bootstrapping Main layer')
        await ensureMainBootstrapped(projectId)
        useMainForExtraction = true
        activeBranch = null
      } else {
        // Main exists: get or create active Branch
        console.log('[Knowledge] Main exists - using Branch')
        activeBranch = await getOrCreateActiveBranch(projectId)
      }
    } catch (error) {
      console.error('[DIAGNOSTIC] triggerEntityExtraction() - Extraction setup failed - error:', error)
      console.error('[Knowledge] Extraction setup failed:', error)
      set({
        extractionInProgress: false,
        extractionError: 'ui.documents.extractionError',
        extractionDocumentId: documentId,
      })
      return
    }

    // Reset state
    set({
      extractionInProgress: true,
      extractionDone: false,
      extractionCancelled: false,
      extractionError: null,
      extractionDocumentId: documentId,
      extractionProgress: null,
      _extractionCancelFlag: false,
    })

    const BATCH_SIZE = 2
    let offset = 0
    let done = false

    console.log('[Knowledge] Starting extraction for version', versionId)

    // Get total chunk count for progress calculation
    const { count: totalChunks, error: countError } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', versionId)

    if (countError) {
      console.error('[DIAGNOSTIC] triggerEntityExtraction() - document_chunks count error - operation: GET /rest/v1/document_chunks - table: document_chunks - versionId:', versionId, 'error_code:', countError.code, 'error_message:', countError.message)
    }

    const total = totalChunks || 0

    set({
      extractionProgress: {
        currentBatch: 0,
        totalChunks: total,
        processedChunks: 0,
        entitiesSaved: 0,
        eventsSaved: 0,
      },
    })

    let totalEntities = 0
    let totalEvents = 0

    while (!done) {
      // Check cancel flag
      if (get()._extractionCancelFlag) {
        set({
          extractionInProgress: false,
          extractionCancelled: true,
        })
        console.log('[Knowledge] Extraction cancelled by user')
        return
      }

      try {
        const { data, error } = await supabase.functions.invoke('extract-knowledge', {
          body: buildExtractionRequest(
            versionId,
            projectId,
            documentId,
            user.id,
            useMainForExtraction ? null : activeBranch?.id || null,
            offset,
            BATCH_SIZE,
          ),
        })

        if (error) {
          console.error('[DIAGNOSTIC] triggerEntityExtraction() - Edge Function error - operation: POST /functions/v1/extract-knowledge - error_code:', error.code, 'error_message:', error.message)
          console.error('[Knowledge] Batch error:', error.message)
          set({
            extractionInProgress: false,
            extractionError: 'ui.documents.extractionError',
          })
          break
        }

        if (!data || !data.success) {
          const errorMsg = data?.error ? 'ui.documents.extractionError' : 'ui.documents.extractionError'
          console.error('[DIAGNOSTIC] triggerEntityExtraction() - Extraction failed - operation: POST /functions/v1/extract-knowledge - success: false - error:', data?.error, 'details:', data?.details?.slice(0, 300) || 'none')
          console.error('[Knowledge] Extraction failed:', errorMsg, 'Details:', data?.details?.slice(0, 300) || 'none')
          set({
            extractionInProgress: false,
            extractionError: errorMsg,
          })
          break
        }

        done = data.done
        offset = data.next_offset

        totalEntities += data.summary?.entities_saved || 0
        totalEvents += data.summary?.events_saved || 0

        const processedChunks = Math.min(offset, total)
        set({
          extractionProgress: {
            currentBatch: Math.ceil(offset / BATCH_SIZE),
            totalChunks: total,
            processedChunks,
            entitiesSaved: totalEntities,
            eventsSaved: totalEvents,
          },
        })

        console.log(`[Knowledge] Batch done: ${data.summary?.entities_saved || 0} entities, ${data.summary?.events_saved || 0} events saved`)

        // Delay between batches to respect Gemini rate limits (15s)
        if (!done) {
          await new Promise(resolve => setTimeout(resolve, 15000))
        }
      } catch (err) {
        console.error('[DIAGNOSTIC] triggerEntityExtraction() - Catch error during extraction - error:', err)
        console.error('[Knowledge] Extraction failed:', err)
        set({
          extractionInProgress: false,
          extractionError: 'ui.documents.extractionError',
        })
        break
      }
    }

    // Only mark done if we completed without cancellation or error
    if (done) {
      set({
        extractionInProgress: false,
        extractionDone: true,
      })
      console.log('[Knowledge] Extraction complete')
    }
  },

  cancelExtraction: () => {
    set({ _extractionCancelFlag: true })
  },

  dismissExtractionStatus: () => {
    set({
      extractionDone: false,
      extractionCancelled: false,
      extractionError: null,
      extractionProgress: null,
      extractionDocumentId: null,
    })
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
