// ============================================
// Pipeline Queue
// Simple in-memory queue for MVP.
// Processes one document at a time (concurrency = 1).
// Interface designed for future migration to BullMQ.
// ============================================

import type { PipelineJob, PipelineStage } from './types.js'
import { runPipeline } from './orchestrator.js'

/**
 * In-memory queue state.
 */
const queue: PipelineJob[] = []
let isProcessing = false
let currentJob: PipelineJob | null = null

/**
 * Enqueue a document version for processing.
 */
export function enqueue(job: Omit<PipelineJob, 'retryCount' | 'enqueuedAt'>): void {
  // Check if already in queue or currently processing
  const exists = queue.some(j => j.versionId === job.versionId) ||
    (currentJob?.versionId === job.versionId)

  if (exists) {
    console.log(`Version ${job.versionId} already in queue — skipping`)
    return
  }

  queue.push({
    ...job,
    retryCount: 0,
    enqueuedAt: new Date(),
  })

  // Start processing if idle
  if (!isProcessing) {
    processNext()
  }
}

/**
 * Process the next job in the queue.
 */
async function processNext(): Promise<void> {
  if (isProcessing || queue.length === 0) return

  isProcessing = true
  currentJob = queue.shift()!

  console.log(`[Pipeline] Processing version ${currentJob.versionId} (attempt ${currentJob.retryCount + 1})`)

  try {
    const result = await runPipeline(
      currentJob.versionId,
      currentJob.projectId,
      currentJob.userId,
      currentJob.documentId,
      currentJob.startFromStage
    )

    if (result.success) {
      console.log(`[Pipeline] Version ${currentJob.versionId} completed: ${result.finalStatus}`)
    } else {
      console.error(`[Pipeline] Version ${currentJob.versionId} failed: ${result.error}`)

      // Retry if under max retries
      if (currentJob.retryCount < 2) { // MAX_RETRIES - 1 because we already ran once
        console.log(`[Pipeline] Requeueing version ${currentJob.versionId} for retry`)
        queue.push({
          ...currentJob,
          retryCount: currentJob.retryCount + 1,
        })
      }
    }
  } catch (error) {
    console.error(`[Pipeline] Unexpected error for version ${currentJob.versionId}:`, error)
  } finally {
    currentJob = null
    isProcessing = false

    // Process next job if any
    if (queue.length > 0) {
      // Small delay between jobs
      setTimeout(processNext, 500)
    }
  }
}

/**
 * Get current queue status.
 */
export function getQueueStatus(): {
  queueLength: number
  isProcessing: boolean
  currentJob: PipelineJob | null
  pendingJobs: PipelineJob[]
} {
  return {
    queueLength: queue.length,
    isProcessing,
    currentJob,
    pendingJobs: [...queue],
  }
}

/**
 * Manually trigger reprocessing from a specific stage.
 */
export function reprocess(
  versionId: string,
  projectId: string,
  userId: string,
  documentId: string,
  fromStage: PipelineStage
): void {
  enqueue({
    versionId,
    projectId,
    userId,
    documentId,
    startFromStage: fromStage,
  })
}
