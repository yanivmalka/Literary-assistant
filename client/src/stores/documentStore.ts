import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useEntityStore } from '@/stores/entityStore'
import { buildExtractionRequest, getExtractionMode, hasMainEntities, getOrCreateActiveBranch } from '@/lib/extractionBranching'
import { DEFAULT_EXTRACTION_MODEL_PROFILE, type ExtractionModelProfile } from '@/lib/extractionModels'
import { useQuillStore } from '@/stores/quillStore'

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
  triggerEntityExtraction: (versionId: string, projectId: string, documentId: string, modelProfile?: ExtractionModelProfile) => Promise<void>
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
        console.error('[DIAGNOSTIC] uploadDocument() - storage upload error - operation: POST Storage project-documents - path:', storagePath, 'error:', uploadError.message || uploadError)
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

  triggerEntityExtraction: async (
    versionId: string,
    projectId: string,
    documentId: string,
    modelProfile: ExtractionModelProfile = DEFAULT_EXTRACTION_MODEL_PROFILE,
  ) => {
    // Update the UI before any authentication or branch lookups. These network
    // calls can take several seconds, so the user should see immediate feedback.
    set({
      extractionInProgress: true,
      extractionDone: false,
      extractionCancelled: false,
      extractionError: null,
      extractionDocumentId: documentId,
      extractionProgress: null,
      _extractionCancelFlag: false,
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Do not leave the UI stuck in the in-progress state if the session expired.
      set({
        extractionInProgress: false,
        extractionDocumentId: null,
      })
      return
    }

    let activeBranch: { id: string } | null = null
    let extractionMode: 'bootstrap' | 'branch' | null = null
    let extractionRunId: string | null = null

    try {
      // CRITICAL FIX: Determine extraction mode ONCE for the entire extraction run
      // NOT per batch. This ensures all batches participate in the same bootstrap
      // or all go to the same branch.
      const mainExists = await hasMainEntities(projectId)

      extractionMode = getExtractionMode(mainExists)
      if (extractionMode === 'bootstrap') {
        // The first successful extraction for a project initializes Main,
        // regardless of which isolated profile the user selected.
        console.log(`[Knowledge] Extraction mode: BOOTSTRAP (${modelProfile}) - initializing Main layer with complete extraction`)
      } else {
        // Every extraction after Main initialization is isolated in the
        // selected profile-specific Branch.
        console.log(`[Knowledge] Extraction mode: BRANCH (${modelProfile})`)
        activeBranch = await getOrCreateActiveBranch(projectId, modelProfile)
      }

      // Generate extraction run ID for cross-batch resolution
      extractionRunId = crypto.randomUUID()
      console.log('[Knowledge] Extraction run:', extractionRunId, 'mode:', extractionMode)
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

    if (total === 0) {
      console.error('[DIAGNOSTIC] triggerEntityExtraction() - No document chunks available for extraction - versionId:', versionId)
      set({
        extractionInProgress: false,
        extractionError: 'ui.documents.extractionError',
      })
      return
    }

    let totalEntities = 0
    let totalEvents = 0
    let totalPersisted = 0

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
        // Send extraction request with:
        // - extraction_mode: 'bootstrap' or 'branch' (constant for all batches in run)
        // - extraction_run_id: shared identifier for cross-batch resolution
        // - target_branch_id: only set if mode is 'branch'
        const { data, error } = await supabase.functions.invoke('extract-knowledge', {
          body: {
            ...buildExtractionRequest(
              versionId,
              projectId,
              documentId,
              user.id,
              extractionMode === 'branch' ? activeBranch?.id || null : null,
              offset,
              BATCH_SIZE,
            ),
            // CRITICAL: Add extraction-level context
            extraction_mode: extractionMode,
            extraction_run_id: extractionRunId,
            // Keep the selected profile constant across every batch in this run.
            model_profile: modelProfile,
          },
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

        if (data.quills) {
          useQuillStore.getState().applyServerWallet(data.quills)
        } else {
          await useQuillStore.getState().loadWallet()
        }

        const nextOffset = Number(data.next_offset ?? offset + BATCH_SIZE)
        // The server historically marks a full final batch as done=false because
        // it cannot distinguish it from a non-final full batch. Use the exact
        // chunk count already queried above to avoid requesting an empty batch.
        done = Boolean(data.done) || nextOffset >= total
        offset = nextOffset

        const summary = data.summary ?? {}
        const batchEntities = Number(summary.entities_saved ?? 0)
        const batchEvents = Number(summary.events_saved ?? 0)
        const batchRelationships = Number(summary.relationships_saved ?? 0)
        const batchAbilityRelationships = Number(summary.ability_relationships_saved ?? 0)
        const reportedPersisted = Number(summary.persisted_items_saved)
        const batchPersisted = Number.isFinite(reportedPersisted)
          ? reportedPersisted
          : batchEntities + batchEvents + batchRelationships + batchAbilityRelationships

        totalEntities += Number.isFinite(batchEntities) ? batchEntities : 0
        totalEvents += Number.isFinite(batchEvents) ? batchEvents : 0
        totalPersisted += Number.isFinite(batchPersisted) ? batchPersisted : 0

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

    // A completed run is empty only when no persisted knowledge item was
    // reported. Older Edge Function revisions do not have persisted_items_saved,
    // so the client falls back to the individual entity/event/relationship
    // counters above.
    if (done) {
      if (totalPersisted === 0) {
        console.warn('[Knowledge] Extraction completed without persisting any entities, relationships, or events')
        set({
          extractionInProgress: false,
          extractionDone: false,
          extractionError: 'ui.documents.extractionError',
        })
        return
      }

      set({
        extractionInProgress: false,
        extractionDone: true,
      })
      // The extraction and entity stores are independent; refresh the cache
      // before the completion message is dismissed or the user opens Knowledge.
      await useEntityStore.getState().fetchEntities(projectId, undefined, modelProfile)
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
