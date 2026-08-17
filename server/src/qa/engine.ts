// ============================================
// Q&A Engine
// Source-grounded retrieval pipeline:
// Question → hybrid search → entity search → context → LLM → answer + sources
// Never sends the entire book to LLM.
// If insufficient context, says so rather than inventing.
// ============================================

import { getCompletionProvider } from '../ai/index.js'
import { hybridSearch, type SearchResult } from '../documents/search.js'
import { getServiceClient } from '../middleware/auth.js'

export interface QASource {
  chunkId: string
  content: string
  chapterNumber: number | null
  chapterTitle: string | null
  page: number | null
  score: number
  documentName?: string
}

export interface QAResult {
  answer: string
  sources: QASource[]
  entitiesReferenced: string[]
  noSufficientContext: boolean
}

/**
 * Build the QA prompt with retrieved context.
 */
function buildQAPrompt(question: string, context: string, entityInfo: string): string {
  return `You are a literary assistant helping an author understand their book. Answer the question based ONLY on the provided context from the book.

Rules:
- Only use information from the provided context passages.
- If the context does not contain enough information to answer, say: "I could not find sufficient information in the document to answer this question."
- Cite your sources using [Chapter X] or [Page Y] format where available.
- Be precise and factual. Do not invent or assume details not present in the text.
- Answer in the same language as the question.

${entityInfo ? `Known entities relevant to this question:\n${entityInfo}\n` : ''}
Context passages from the book:
${context}

Question: ${question}

Answer:`
}

/**
 * Search for entities relevant to the question.
 */
async function findRelevantEntities(projectId: string, question: string): Promise<{
  entityInfo: string
  entityNames: string[]
}> {
  const supabase = getServiceClient()

  // Simple keyword match against entity names
  const { data: entities } = await supabase
    .from('entities')
    .select('name, entity_type, aliases')
    .eq('project_id', projectId)
    .in('status', ['confirmed', 'pending'])

  if (!entities || entities.length === 0) {
    return { entityInfo: '', entityNames: [] }
  }

  const questionLower = question.toLowerCase()
  const relevant = entities.filter(e => {
    const names = [e.name, ...(e.aliases || [])].map(n => n.toLowerCase())
    return names.some(n => questionLower.includes(n) || n.includes(questionLower.split(' ').filter(w => w.length > 2)[0] || ''))
  })

  if (relevant.length === 0) {
    return { entityInfo: '', entityNames: [] }
  }

  // Get attributes for relevant entities
  const entityNames = relevant.map(e => e.name)
  const entityInfo = relevant.map(e => `- ${e.name} (${e.entity_type})`).join('\n')

  return { entityInfo, entityNames }
}

/**
 * Main Q&A function.
 * Retrieves relevant context, builds prompt, sends to LLM.
 */
export async function askQuestion(
  projectId: string,
  question: string,
  options?: { topK?: number }
): Promise<QAResult> {
  const topK = options?.topK || 5

  // Step 1: Hybrid search for relevant chunks
  const searchResults = await hybridSearch(projectId, question, topK)

  // Step 2: Find relevant entities
  const { entityInfo, entityNames } = await findRelevantEntities(projectId, question)

  // Step 3: Build context from search results
  const sources: QASource[] = searchResults.map(r => ({
    chunkId: r.chunkId,
    content: r.content,
    chapterNumber: r.chapterNumber,
    chapterTitle: r.chapterTitle,
    page: r.page,
    score: r.score,
    documentName: r.documentName,
  }))

  // If no results found at all
  if (sources.length === 0) {
    return {
      answer: '',
      sources: [],
      entitiesReferenced: entityNames,
      noSufficientContext: true,
    }
  }

  // Step 4: Check if we have a completion provider
  const provider = getCompletionProvider()
  if (!provider || !(await provider.isAvailable())) {
    // No LLM available — return raw sources without generated answer
    return {
      answer: '',
      sources,
      entitiesReferenced: entityNames,
      noSufficientContext: false,
    }
  }

  // Step 5: Build context string with source references
  const contextParts = sources.map((s, i) => {
    const ref = s.chapterTitle
      ? `[Chapter ${s.chapterNumber}: ${s.chapterTitle}]`
      : s.chapterNumber
        ? `[Chapter ${s.chapterNumber}]`
        : s.page
          ? `[Page ${s.page}]`
          : `[Source ${i + 1}]`
    return `${ref}\n${s.content}`
  })
  const context = contextParts.join('\n\n---\n\n')

  // Step 6: Generate answer
  try {
    const prompt = buildQAPrompt(question, context, entityInfo)
    const result = await provider.complete(prompt, {
      maxTokens: 1024,
      temperature: 0.2,
    })

    const answer = result.text.trim()
    const noSufficientContext = answer.toLowerCase().includes('could not find sufficient information') ||
      answer.includes('לא נמצא מספיק מידע')

    return {
      answer,
      sources,
      entitiesReferenced: entityNames,
      noSufficientContext,
    }
  } catch (error) {
    console.error('Q&A LLM error:', error)
    // Return sources without answer on LLM failure
    return {
      answer: '',
      sources,
      entitiesReferenced: entityNames,
      noSufficientContext: false,
    }
  }
}
