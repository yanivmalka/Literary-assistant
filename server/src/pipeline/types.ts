// ============================================
// Pipeline Types
// ============================================

/**
 * Pipeline stages in execution order.
 */
export const PIPELINE_STAGES = [
  'extraction',
  'chunking',
  'indexing',
  'entity_extraction',
  'attribute_extraction',
  'contradiction_detection',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

/**
 * Status that corresponds to each completed stage.
 */
export const STAGE_TO_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracted',
  chunking: 'chunked',
  indexing: 'indexed',
  entity_extraction: 'analyzing',
  attribute_extraction: 'analyzing',
  contradiction_detection: 'ready',
}

/**
 * Status set when a stage starts.
 */
export const STAGE_START_STATUS: Record<PipelineStage, string> = {
  extraction: 'extracting',
  chunking: 'chunking',
  indexing: 'indexing',
  entity_extraction: 'analyzing',
  attribute_extraction: 'analyzing',
  contradiction_detection: 'analyzing',
}

/**
 * Error categories for pipeline failures.
 */
export type ErrorCategory = 'parsing_error' | 'ai_provider_error' | 'database_error' | 'storage_error' | 'unknown_error'

/**
 * Result of a pipeline stage execution.
 */
export interface StageResult {
  success: boolean
  error?: string
  errorCategory?: ErrorCategory
  skipped?: boolean     // true if stage was skipped (e.g., no AI provider)
  skipReason?: string
}

/**
 * Pipeline job in the queue.
 */
export interface PipelineJob {
  versionId: string
  projectId: string
  userId: string
  documentId: string
  startFromStage?: PipelineStage  // resume from this stage
  retryCount: number
  enqueuedAt: Date
}

/**
 * Pipeline processing status for a version.
 */
export interface PipelineStatus {
  versionId: string
  currentStage: PipelineStage | null
  completedStages: PipelineStage[]
  status: string
  error?: string
  errorStage?: string
  progress: number  // 0-100
}
