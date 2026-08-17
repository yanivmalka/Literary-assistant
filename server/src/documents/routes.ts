// ============================================
// Document Routes
// Handles document upload, listing, versioning, and deletion.
// Storage: Supabase Storage bucket 'project-documents'
// Path: {user_id}/{project_id}/{document_id}/{version_number}/{filename}
// ============================================

import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth, getServiceClient } from '../middleware/auth.js'
import { enqueue, getQueueStatus, reprocess } from '../pipeline/index.js'
import type { PipelineStage } from '../pipeline/types.js'

const router = Router()

// Multer config: store in memory (files go to Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    ]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF and DOCX are supported.'))
    }
  },
})

/**
 * POST /api/projects/:projectId/documents/upload
 * Upload a new document or a new version of an existing document.
 * Body (multipart): file + optional document_id (for new version of existing doc)
 */
router.post(
  '/projects/:projectId/documents/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params
      const userId = req.user!.id
      const file = req.file
      const existingDocumentId = req.body.document_id as string | undefined

      if (!file) {
        res.status(400).json({ error: 'No file provided' })
        return
      }

      const supabase = getServiceClient()

      // Verify user owns this project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single()

      if (projectError || !project) {
        res.status(404).json({ error: 'Project not found or access denied' })
        return
      }

      // Determine file type
      const fileType = file.mimetype === 'application/pdf' ? 'pdf' : 'docx'
      const fileName = file.originalname

      let documentId: string
      let versionNumber: number

      if (existingDocumentId) {
        // New version of existing document
        const { data: existingDoc, error: docError } = await supabase
          .from('documents')
          .select('id')
          .eq('id', existingDocumentId)
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .single()

        if (docError || !existingDoc) {
          res.status(404).json({ error: 'Document not found or access denied' })
          return
        }

        documentId = existingDocumentId

        // Get next version number
        const { data: latestVersion } = await supabase
          .from('document_versions')
          .select('version_number')
          .eq('document_id', documentId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single()

        versionNumber = (latestVersion?.version_number ?? 0) + 1
      } else {
        // New document
        const { data: newDoc, error: createError } = await supabase
          .from('documents')
          .insert({
            project_id: projectId,
            user_id: userId,
            name: fileName,
            file_type: fileType,
          })
          .select('id')
          .single()

        if (createError || !newDoc) {
          res.status(500).json({ error: 'Failed to create document record' })
          return
        }

        documentId = newDoc.id
        versionNumber = 1
      }

      // Upload file to Supabase Storage
      const storagePath = `${userId}/${projectId}/${documentId}/${versionNumber}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        })

      if (uploadError) {
        // Clean up document record if this was a new document
        if (!existingDocumentId) {
          await supabase.from('documents').delete().eq('id', documentId)
        }
        res.status(500).json({ error: 'Failed to upload file to storage', details: uploadError.message })
        return
      }

      // Create version record
      const { data: version, error: versionError } = await supabase
        .from('document_versions')
        .insert({
          document_id: documentId,
          version_number: versionNumber,
          storage_path: storagePath,
          file_size: file.size,
          status: 'uploaded',
        })
        .select('id, version_number, status, created_at')
        .single()

      if (versionError || !version) {
        res.status(500).json({ error: 'Failed to create version record' })
        return
      }

      res.status(201).json({
        document_id: documentId,
        version_id: version.id,
        version_number: version.version_number,
        status: version.status,
        file_name: fileName,
        file_type: fileType,
        file_size: file.size,
        created_at: version.created_at,
      })

      // Trigger pipeline processing in background
      enqueue({
        versionId: version.id,
        projectId: projectId as string,
        userId,
        documentId,
      })
    } catch (error) {
      console.error('Document upload error:', error)
      res.status(500).json({ error: 'Internal server error during upload' })
    }
  }
)

/**
 * GET /api/projects/:projectId/documents
 * List all documents in a project with their latest version status.
 */
router.get(
  '/projects/:projectId/documents',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params
      const userId = req.user!.id
      const supabase = getServiceClient()

      // Verify project ownership
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single()

      if (!project) {
        res.status(404).json({ error: 'Project not found or access denied' })
        return
      }

      // Get documents with their latest version
      const { data: documents, error } = await supabase
        .from('documents')
        .select(`
          id,
          name,
          file_type,
          created_at,
          updated_at,
          document_versions (
            id,
            version_number,
            status,
            file_size,
            error_message,
            error_stage,
            processing_started_at,
            processing_completed_at,
            created_at
          )
        `)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) {
        res.status(500).json({ error: 'Failed to fetch documents' })
        return
      }

      // Transform: attach latest version info to each document
      const result = (documents || []).map(doc => {
        const versions = (doc.document_versions as Array<{
          id: string
          version_number: number
          status: string
          file_size: number | null
          error_message: string | null
          error_stage: string | null
          processing_started_at: string | null
          processing_completed_at: string | null
          created_at: string
        }>) || []
        const latest = versions.sort((a, b) => b.version_number - a.version_number)[0] || null

        return {
          id: doc.id,
          name: doc.name,
          file_type: doc.file_type,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          version_count: versions.length,
          latest_version: latest ? {
            id: latest.id,
            version_number: latest.version_number,
            status: latest.status,
            file_size: latest.file_size,
            error_message: latest.error_message,
            error_stage: latest.error_stage,
            processing_started_at: latest.processing_started_at,
            processing_completed_at: latest.processing_completed_at,
            created_at: latest.created_at,
          } : null,
        }
      })

      res.json({ documents: result })
    } catch (error) {
      console.error('Document list error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/documents/:documentId/versions
 * List all versions of a document.
 */
router.get(
  '/projects/:projectId/documents/:documentId/versions',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, documentId } = req.params
      const userId = req.user!.id
      const supabase = getServiceClient()

      // Verify document ownership
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!doc) {
        res.status(404).json({ error: 'Document not found or access denied' })
        return
      }

      const { data: versions, error } = await supabase
        .from('document_versions')
        .select(`
          id,
          version_number,
          storage_path,
          file_size,
          status,
          error_message,
          error_stage,
          structure_metadata,
          processing_started_at,
          processing_completed_at,
          created_at
        `)
        .eq('document_id', documentId)
        .order('version_number', { ascending: false })

      if (error) {
        res.status(500).json({ error: 'Failed to fetch versions' })
        return
      }

      res.json({ versions: versions || [] })
    } catch (error) {
      console.error('Document versions error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/projects/:projectId/documents/:documentId/versions/:versionId/status
 * Get processing status for a specific version.
 */
router.get(
  '/projects/:projectId/documents/:documentId/versions/:versionId/status',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, documentId, versionId } = req.params
      const userId = req.user!.id
      const supabase = getServiceClient()

      // Verify ownership chain
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!doc) {
        res.status(404).json({ error: 'Document not found or access denied' })
        return
      }

      const { data: version, error } = await supabase
        .from('document_versions')
        .select(`
          id,
          version_number,
          status,
          error_message,
          error_stage,
          structure_metadata,
          processing_started_at,
          processing_completed_at
        `)
        .eq('id', versionId)
        .eq('document_id', documentId)
        .single()

      if (error || !version) {
        res.status(404).json({ error: 'Version not found' })
        return
      }

      res.json(version)
    } catch (error) {
      console.error('Version status error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * DELETE /api/projects/:projectId/documents/:documentId
 * Delete a document and all its versions, chunks, embeddings.
 * Also removes files from storage.
 */
router.delete(
  '/projects/:projectId/documents/:documentId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, documentId } = req.params
      const userId = req.user!.id
      const supabase = getServiceClient()

      // Verify ownership
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!doc) {
        res.status(404).json({ error: 'Document not found or access denied' })
        return
      }

      // Get all storage paths for cleanup
      const { data: versions } = await supabase
        .from('document_versions')
        .select('storage_path')
        .eq('document_id', documentId)

      // Delete from storage (best effort — don't fail if storage cleanup fails)
      if (versions && versions.length > 0) {
        const paths = versions.map(v => v.storage_path)
        await supabase.storage.from('project-documents').remove(paths)
      }

      // Delete document (cascades to versions, chunks, embeddings)
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

      if (error) {
        res.status(500).json({ error: 'Failed to delete document' })
        return
      }

      res.json({ success: true, message: 'Document deleted' })
    } catch (error) {
      console.error('Document delete error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * POST /api/projects/:projectId/documents/:documentId/versions/:versionId/reprocess
 * Trigger reprocessing from a specific stage.
 */
router.post(
  '/projects/:projectId/documents/:documentId/versions/:versionId/reprocess',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, documentId, versionId } = req.params
      const userId = req.user!.id
      const { from_stage } = req.body
      const supabase = getServiceClient()

      // Verify ownership
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()

      if (!doc) {
        res.status(404).json({ error: 'Document not found or access denied' })
        return
      }

      reprocess(versionId as string, projectId as string, userId, documentId as string, from_stage as PipelineStage || 'extraction')
      res.json({ success: true, message: 'Reprocessing enqueued' })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * POST /api/projects/:projectId/search
 * Search across all documents in a project.
 */
router.post(
  '/projects/:projectId/search',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params
      const userId = req.user!.id
      const { query, mode, top_k } = req.body
      const supabase = getServiceClient()

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'query is required' })
        return
      }

      // Verify project ownership
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single()

      if (!project) {
        res.status(404).json({ error: 'Project not found or access denied' })
        return
      }

      const { search } = await import('../documents/search.js')
      const results = await search(projectId as string, query, {
        mode: mode || 'hybrid',
        topK: top_k || 5,
      })

      res.json({ results })
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

/**
 * GET /api/pipeline/status
 * Get current pipeline queue status (admin/debug endpoint).
 */
router.get(
  '/pipeline/status',
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    const status = getQueueStatus()
    res.json(status)
  }
)

// Handle multer errors (file too large, invalid type)
router.use((error: Error, _req: Request, res: Response, next: Function) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Maximum size is 50MB.' })
      return
    }
    res.status(400).json({ error: `Upload error: ${error.message}` })
    return
  }
  if (error.message.includes('Invalid file type')) {
    res.status(400).json({ error: error.message })
    return
  }
  next(error)
})

export default router
