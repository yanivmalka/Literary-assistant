// ============================================
// Search Module
// Provides semantic search (pgvector), full-text search, and hybrid search.
// All searches are scoped to a project.
// ============================================

import { getEmbeddingProvider } from '../ai/index.js'
import { getServiceClient } from '../middleware/auth.js'

/**
 * A search result with score and metadata.
 */
export interface SearchResult {
  chunkId: string
  content: string
  score: number
  chapterNumber: number | null
  chapterTitle: string | null
  page: number | null
  position: number
  versionId: string
  documentId?: string
  documentName?: string
}

/**
 * Search mode.
 */
export type SearchMode = 'semantic' | 'text' | 'hybrid'

/**
 * Perform semantic search using pgvector cosine similarity.
 */
export async function semanticSearch(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const provider = getEmbeddingProvider()
  if (!provider) {
    return [] // No embedding provider — semantic search unavailable
  }

  const supabase = getServiceClient()
  const modelName = provider.getModelName()

  // Generate embedding for the query
  const queryEmbedding = await provider.generateEmbedding(query)

  // Use Supabase RPC for vector similarity search
  // We need a SQL function for this, but can also use raw query via PostgREST
  // Alternative: use the match_documents RPC pattern
  const { data, error } = await supabase.rpc('search_chunks_semantic', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_project_id: projectId,
    match_model_name: modelName,
    match_count: topK,
  })

  if (error) {
    console.error('Semantic search error:', error)
    // Fallback: return empty results rather than crashing
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: row.chunk_id as string,
    content: row.content as string,
    score: row.similarity as number,
    chapterNumber: row.chapter_number as number | null,
    chapterTitle: row.chapter_title as string | null,
    page: row.page as number | null,
    position: row.position as number,
    versionId: row.version_id as string,
    documentId: row.document_id as string | undefined,
    documentName: row.document_name as string | undefined,
  }))
}

/**
 * Perform full-text search using PostgreSQL tsvector.
 * Uses 'simple' configuration which works across languages including Hebrew.
 */
export async function fullTextSearch(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const supabase = getServiceClient()

  // Use RPC for full-text search scoped to project
  const { data, error } = await supabase.rpc('search_chunks_fulltext', {
    search_query: query,
    match_project_id: projectId,
    match_count: topK,
  })

  if (error) {
    console.error('Full-text search error:', error)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: row.chunk_id as string,
    content: row.content as string,
    score: row.rank as number,
    chapterNumber: row.chapter_number as number | null,
    chapterTitle: row.chapter_title as string | null,
    page: row.page as number | null,
    position: row.position as number,
    versionId: row.version_id as string,
    documentId: row.document_id as string | undefined,
    documentName: row.document_name as string | undefined,
  }))
}

/**
 * Perform hybrid search: combines semantic and full-text results.
 * Deduplicates and merges scores with configurable weights.
 */
export async function hybridSearch(
  projectId: string,
  query: string,
  topK: number = 5,
  semanticWeight: number = 0.7,
  textWeight: number = 0.3
): Promise<SearchResult[]> {
  // Run both searches in parallel
  const [semanticResults, textResults] = await Promise.all([
    semanticSearch(projectId, query, topK * 2),  // fetch more for better merging
    fullTextSearch(projectId, query, topK * 2),
  ])

  // Merge results by chunkId
  const merged = new Map<string, SearchResult & { combinedScore: number }>()

  for (const result of semanticResults) {
    merged.set(result.chunkId, {
      ...result,
      combinedScore: result.score * semanticWeight,
    })
  }

  for (const result of textResults) {
    const existing = merged.get(result.chunkId)
    if (existing) {
      existing.combinedScore += result.score * textWeight
    } else {
      merged.set(result.chunkId, {
        ...result,
        combinedScore: result.score * textWeight,
      })
    }
  }

  // Sort by combined score and return top-K
  const sorted = Array.from(merged.values())
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK)
    .map(({ combinedScore, ...rest }) => ({
      ...rest,
      score: combinedScore,
    }))

  return sorted
}

/**
 * Main search function — dispatches to the appropriate search mode.
 */
export async function search(
  projectId: string,
  query: string,
  options?: {
    mode?: SearchMode
    topK?: number
    semanticWeight?: number
    textWeight?: number
  }
): Promise<SearchResult[]> {
  const mode = options?.mode || 'hybrid'
  const topK = options?.topK || 5

  switch (mode) {
    case 'semantic':
      return semanticSearch(projectId, query, topK)
    case 'text':
      return fullTextSearch(projectId, query, topK)
    case 'hybrid':
    default:
      return hybridSearch(
        projectId,
        query,
        topK,
        options?.semanticWeight ?? 0.7,
        options?.textWeight ?? 0.3
      )
  }
}
