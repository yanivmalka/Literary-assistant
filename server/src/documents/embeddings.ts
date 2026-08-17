// ============================================
// Embedding Generation
// Uses AI Abstraction Layer for embedding generation.
// Batch processing with rate limiting.
// Stores in chunk_embeddings with model_name + dimensions.
// Marks old embeddings as stale when model changes.
// ============================================

import { getEmbeddingProvider } from '../ai/index.js'
import { getServiceClient } from '../middleware/auth.js'

/**
 * Configuration for embedding generation.
 */
export interface EmbeddingConfig {
  batchSize: number       // chunks per batch (default: 10)
  delayBetweenBatchesMs: number  // rate limit delay (default: 1000)
}

function loadEmbeddingConfig(): EmbeddingConfig {
  return {
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '10', 10),
    delayBetweenBatchesMs: parseInt(process.env.EMBEDDING_BATCH_DELAY_MS || '1000', 10),
  }
}

/**
 * Generate embeddings for all chunks of a document version.
 * Skips chunks that already have non-stale embeddings for the current model.
 * Returns the number of embeddings generated.
 */
export async function generateEmbeddingsForVersion(versionId: string): Promise<{
  generated: number
  skipped: number
  error?: string
}> {
  const provider = getEmbeddingProvider()
  if (!provider) {
    return { generated: 0, skipped: 0, error: 'No embedding provider available' }
  }

  const modelName = provider.getModelName()
  const dimensions = provider.getDimensions()
  const config = loadEmbeddingConfig()
  const supabase = getServiceClient()

  // Get all chunks for this version
  const { data: chunks, error: chunksError } = await supabase
    .from('document_chunks')
    .select('id, content')
    .eq('version_id', versionId)
    .order('position', { ascending: true })

  if (chunksError || !chunks) {
    return { generated: 0, skipped: 0, error: `Failed to fetch chunks: ${chunksError?.message}` }
  }

  // Get existing non-stale embeddings for current model
  const chunkIds = chunks.map(c => c.id)
  const { data: existing } = await supabase
    .from('chunk_embeddings')
    .select('chunk_id')
    .in('chunk_id', chunkIds)
    .eq('model_name', modelName)
    .eq('is_stale', false)

  const existingSet = new Set((existing || []).map(e => e.chunk_id))

  // Filter to only chunks that need embeddings
  const chunksToEmbed = chunks.filter(c => !existingSet.has(c.id))
  const skipped = chunks.length - chunksToEmbed.length

  if (chunksToEmbed.length === 0) {
    return { generated: 0, skipped }
  }

  let generated = 0

  // Process in batches
  for (let i = 0; i < chunksToEmbed.length; i += config.batchSize) {
    const batch = chunksToEmbed.slice(i, i + config.batchSize)
    const texts = batch.map(c => c.content)

    try {
      const embeddings = await provider.generateEmbeddings(texts)

      // Insert embeddings
      const records = batch.map((chunk, idx) => ({
        chunk_id: chunk.id,
        model_name: modelName,
        dimensions,
        embedding: JSON.stringify(embeddings[idx]),
        is_stale: false,
      }))

      const { error: insertError } = await supabase
        .from('chunk_embeddings')
        .insert(records)

      if (insertError) {
        console.error(`Embedding insert error at batch ${i}:`, insertError)
        // Continue with next batch rather than failing entirely
      } else {
        generated += batch.length
      }
    } catch (error) {
      console.error(`Embedding generation error at batch ${i}:`, error)
      // Continue with remaining batches
    }

    // Rate limit delay between batches
    if (i + config.batchSize < chunksToEmbed.length) {
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatchesMs))
    }
  }

  return { generated, skipped }
}

/**
 * Mark all embeddings for a project as stale.
 * Called when the embedding model configuration changes.
 */
export async function markEmbeddingsStale(projectId: string): Promise<number> {
  const supabase = getServiceClient()

  // Get all document version IDs for this project
  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .eq('project_id', projectId)

  if (!docs || docs.length === 0) return 0

  const docIds = docs.map(d => d.id)
  const { data: versions } = await supabase
    .from('document_versions')
    .select('id')
    .in('document_id', docIds)

  if (!versions || versions.length === 0) return 0

  const versionIds = versions.map(v => v.id)
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('id')
    .in('version_id', versionIds)

  if (!chunks || chunks.length === 0) return 0

  const chunkIds = chunks.map(c => c.id)

  const { data } = await supabase
    .from('chunk_embeddings')
    .update({ is_stale: true })
    .in('chunk_id', chunkIds)
    .eq('is_stale', false)
    .select('id')

  return data?.length || 0
}
