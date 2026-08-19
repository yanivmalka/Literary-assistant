// ============================================
// Pipeline Orchestrator
// Runs document processing stages in order.
// Idempotent: checks current status and resumes from last successful step.
// Each stage is independent and re-runnable.
// AI-dependent stages gracefully skip if no provider available.
// ============================================

import { getServiceClient } from '../middleware/auth.js'
import { extractDocument } from '../documents/extractors/index.js'
import { detectStructure } from '../documents/structure-detector.js'
import { chunkDocument, mergeSmallChunks, loadChunkerConfig } from '../documents/chunker.js'
import { generateEmbeddingsForVersion } from '../documents/embeddings.js'
import { detectContradictions } from '../entities/contradictions.js'
import type { PipelineStage, StageResult, ErrorCategory } from './types.js'
import { PIPELINE_STAGES, STAGE_START_STATUS, STAGE_TO_STATUS } from './types.js'

const MAX_RETRIES = 3

/**
 * Determine which stage to resume from based on current version status.
 */
function getResumeStage(status: string): PipelineStage | null {
  switch (status) {
    case 'uploaded':
      return 'extraction'
    case 'extracting':
      return 'extraction' // retry
    case 'extracted':
      return 'chunking'
    case 'chunking':
      return 'chunking' // retry
    case 'chunked':
      return 'indexing'
    case 'indexing':
      return 'indexing' // retry
    case 'indexed':
      return 'entity_extraction'
    case 'analyzing':
      return 'entity_extraction' // might need to check which sub-stage
    case 'ready':
      return null // already done
    case 'error':
      return null // need explicit retry with startFromStage
    case 'skipped_no_provider':
      return null // AI stages skipped — document is usable for search
    default:
      return 'extraction'
  }
}

/**
 * Run the full pipeline for a document version.
 * Resumes from the appropriate stage based on current status.
 */
export async function runPipeline(
  versionId: string,
  projectId: string,
  userId: string,
  documentId: string,
  startFromStage?: PipelineStage
): Promise<{ success: boolean; finalStatus: string; error?: string }> {
  const supabase = getServiceClient()

  // Get current version status
  const { data: version } = await supabase
    .from('document_versions')
    .select('status, storage_path, error_stage')
    .eq('id', versionId)
    .single()

  if (!version) {
    return { success: false, finalStatus: 'error', error: 'Version not found' }
  }

  // Determine starting stage
  let resumeStage = startFromStage || getResumeStage(version.status)
  if (!resumeStage) {
    // Already complete or in error state without explicit start stage
    if (version.status === 'error' && version.error_stage) {
      resumeStage = version.error_stage as PipelineStage
    } else {
      return { success: true, finalStatus: version.status }
    }
  }

  // Set processing_started_at
  await supabase
    .from('document_versions')
    .update({ processing_started_at: new Date().toISOString() })
    .eq('id', versionId)

  // Find the index of the resume stage
  const startIndex = PIPELINE_STAGES.indexOf(resumeStage)
  if (startIndex === -1) {
    return { success: false, finalStatus: 'error', error: `Invalid stage: ${resumeStage}` }
  }

  // Run stages sequentially from resume point
  for (let i = startIndex; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i]

    // Update status to "in progress" for this stage
    await supabase
      .from('document_versions')
      .update({ status: STAGE_START_STATUS[stage], error_message: null, error_stage: null })
      .eq('id', versionId)

    // Execute the stage
    const result = await executeStage(stage, versionId, projectId, userId, documentId, version.storage_path)

    if (result.skipped) {
      // Stage was skipped (e.g., no AI provider) — mark as skipped and continue
      // For AI-dependent stages, the document is still usable for search
      if (stage === 'entity_extraction') {
        // If entity extraction is skipped, attribute and contradiction stages also skip
        await supabase
          .from('document_versions')
          .update({
            status: 'skipped_no_provider',
            error_message: result.skipReason,
            processing_completed_at: new Date().toISOString(),
          })
          .eq('id', versionId)
        return { success: true, finalStatus: 'skipped_no_provider' }
      }
      continue
    }

    if (!result.success) {
      // Stage failed — update status and stop
      await supabase
        .from('document_versions')
        .update({
          status: 'error',
          error_message: result.error || 'Unknown error',
          error_stage: stage,
        })
        .eq('id', versionId)

      return { success: false, finalStatus: 'error', error: result.error }
    }

    // Stage succeeded — update status
    await supabase
      .from('document_versions')
      .update({ status: STAGE_TO_STATUS[stage] })
      .eq('id', versionId)
  }

  // All stages complete
  await supabase
    .from('document_versions')
    .update({
      status: 'ready',
      processing_completed_at: new Date().toISOString(),
    })
    .eq('id', versionId)

  return { success: true, finalStatus: 'ready' }
}

/**
 * Execute a single pipeline stage.
 */
async function executeStage(
  stage: PipelineStage,
  versionId: string,
  projectId: string,
  userId: string,
  documentId: string,
  storagePath: string
): Promise<StageResult> {
  try {
    switch (stage) {
      case 'extraction':
        return await runExtraction(versionId, storagePath)
      case 'chunking':
        return await runChunking(versionId)
      case 'indexing':
        return await runIndexing(versionId)
      case 'entity_extraction':
        return await runEntityExtraction(versionId, projectId, userId)
      case 'attribute_extraction':
        return await runAttributeExtraction(projectId)
      case 'contradiction_detection':
        return await runContradictionDetection(projectId)
      default:
        return { success: false, error: `Unknown stage: ${stage}`, errorCategory: 'unknown_error' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, errorCategory: categorizeError(error) }
  }
}

/**
 * Stage: Extract text from the document file.
 */
async function runExtraction(versionId: string, storagePath: string): Promise<StageResult> {
  const supabase = getServiceClient()

  // Download file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-documents')
    .download(storagePath)

  if (downloadError || !fileData) {
    return { success: false, error: `Failed to download file: ${downloadError?.message}`, errorCategory: 'storage_error' }
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const fileType = storagePath.endsWith('.docx') ? 'docx' : 'pdf' as 'pdf' | 'docx'

  // Extract text
  const result = await extractDocument(buffer, fileType)

  // Save structure metadata
  await supabase
    .from('document_versions')
    .update({
      structure_metadata: {
        totalPages: result.totalPages,
        isScanned: result.isScanned,
        detectedLanguage: result.detectedLanguage,
        extractorUsed: result.metadata.extractorUsed,
        averageCharsPerPage: result.metadata.averageCharsPerPage,
        fullTextLength: result.fullText.length,
      },
    })
    .eq('id', versionId)

  // Store extracted text temporarily in metadata for chunking stage
  // (Chunking stage will read from this)
  await supabase
    .from('document_versions')
    .update({
      structure_metadata: {
        totalPages: result.totalPages,
        isScanned: result.isScanned,
        detectedLanguage: result.detectedLanguage,
        extractorUsed: result.metadata.extractorUsed,
        averageCharsPerPage: result.metadata.averageCharsPerPage,
        fullTextLength: result.fullText.length,
        _extractedText: result.fullText, // temporary, cleared after chunking
      },
    })
    .eq('id', versionId)

  return { success: true }
}

/**
 * Stage: Detect structure and chunk the document.
 */
async function runChunking(versionId: string): Promise<StageResult> {
  const supabase = getServiceClient()

  // Get extracted text from metadata
  const { data: version } = await supabase
    .from('document_versions')
    .select('structure_metadata')
    .eq('id', versionId)
    .single()

  const metadata = version?.structure_metadata as Record<string, unknown> | null
  const fullText = metadata?._extractedText as string | undefined

  if (!fullText) {
    return { success: false, error: 'No extracted text found — extraction stage may have failed', errorCategory: 'parsing_error' }
  }

  // Detect structure
  const structure = detectStructure(fullText)

  // Chunk
  const config = loadChunkerConfig()
  let chunks = chunkDocument(structure, config)
  chunks = mergeSmallChunks(chunks, config.minTokens)

  if (chunks.length === 0) {
    return { success: false, error: 'Document produced no chunks — may be empty', errorCategory: 'parsing_error' }
  }

  // Clear any existing chunks for this version (idempotent)
  await supabase
    .from('document_chunks')
    .delete()
    .eq('version_id', versionId)

  // Save chunks
  const chunkRecords = chunks.map(chunk => ({
    version_id: versionId,
    chapter_number: chunk.chapterNumber,
    chapter_title: chunk.chapterTitle,
    position: chunk.position,
    scene_break: chunk.sceneBreak,
    content: chunk.content,
    token_count: chunk.tokenCount,
    metadata: chunk.metadata,
  }))

  // Insert in batches of 50
  for (let i = 0; i < chunkRecords.length; i += 50) {
    const batch = chunkRecords.slice(i, i + 50)
    const { error } = await supabase.from('document_chunks').insert(batch)
    if (error) {
      return { success: false, error: `Failed to save chunks: ${error.message}`, errorCategory: 'database_error' }
    }
  }

  // Clear extracted text from metadata (no longer needed)
  const cleanMetadata = { ...metadata }
  delete cleanMetadata._extractedText
  cleanMetadata.chunkCount = chunks.length
  cleanMetadata.chapterCount = structure.chapters.length

  await supabase
    .from('document_versions')
    .update({ structure_metadata: cleanMetadata })
    .eq('id', versionId)

  return { success: true }
}

/**
 * Stage: Generate embeddings for all chunks.
 */
async function runIndexing(versionId: string): Promise<StageResult> {
  const result = await generateEmbeddingsForVersion(versionId)

  if (result.error) {
    // If error is "no provider", this is a skip not a failure
    if (result.error.includes('No embedding provider')) {
      return { success: false, error: result.error, errorCategory: 'ai_provider_error' }
    }
    return { success: false, error: result.error, errorCategory: 'ai_provider_error' }
  }

  return { success: true }
}

/**
 * Stage: Extract entities from chunks using AI.
 * Skips gracefully if no CompletionProvider available.
 */
async function runEntityExtraction(_versionId: string, _projectId: string, _userId: string): Promise<StageResult> {
  // The legacy server extractor writes Main-scoped tables and has no Branch context.
  // Keep the pipeline safe by refusing this stage until it is routed through the
  // Branch-validated extract-knowledge function.
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI entity extraction disabled: active Branch routing is required.',
  }
}

/**
 * Stage: Extract detailed attributes for entities.
 * Skips if no CompletionProvider available.
 */
async function runAttributeExtraction(_projectId: string): Promise<StageResult> {
  return {
    skipped: true,
    success: true,
    skipReason: 'Legacy AI attribute extraction disabled: active Branch routing is required.',
  }
}

/**
 * Stage: Detect contradictions in entity attributes.
 * This is local logic — no AI provider needed.
 */
async function runContradictionDetection(projectId: string): Promise<StageResult> {
  const result = await detectContradictions(projectId)

  if (result.error) {
    return { success: false, error: result.error, errorCategory: 'database_error' }
  }

  return { success: true }
}

/**
 * Categorize an error for reporting.
 */
function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('storage') || msg.includes('download') || msg.includes('upload')) return 'storage_error'
    if (msg.includes('provider') || msg.includes('ai') || msg.includes('huggingface')) return 'ai_provider_error'
    if (msg.includes('database') || msg.includes('supabase') || msg.includes('insert') || msg.includes('select')) return 'database_error'
    if (msg.includes('parse') || msg.includes('extract') || msg.includes('chunk')) return 'parsing_error'
  }
  return 'unknown_error'
}
