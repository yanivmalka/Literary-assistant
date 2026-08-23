import { describe, expect, it } from 'vitest'
import {
  adjacentPositions,
  buildRetrievalTerms,
  mergeAdjacentRetrievalChunks,
  type RetrievalChunk,
} from '../../../../supabase/functions/_shared/qa-retrieval.ts'

type BenchmarkChunk = RetrievalChunk & {
  chapter: number
}

const corpus: BenchmarkChunk[] = [
  {
    id: 'v1-c0',
    content: 'Leo entered the northern hall and touched the locked Cabinet.',
    chapter: 1,
    chapter_number: 1,
    chapter_title: 'The Hall',
    page: 1,
    position: 0,
    version_id: 'v1',
    score: 0,
  },
  {
    id: 'v1-c1',
    content: 'The Cabinet opened only after Leo whispered the old name.',
    chapter: 1,
    chapter_number: 1,
    chapter_title: 'The Hall',
    page: 1,
    position: 1,
    version_id: 'v1',
    score: 0,
  },
  {
    id: 'v1-c2',
    content: 'Raven waited beside the tower while the storm crossed the valley.',
    chapter: 2,
    chapter_number: 2,
    chapter_title: 'The Tower',
    page: 4,
    position: 2,
    version_id: 'v1',
    score: 0,
  },
  {
    id: 'v2-c0',
    content: 'The glass Cabinet stood in the workshop, empty and cold.',
    chapter: 1,
    chapter_number: 1,
    chapter_title: 'A New Version',
    page: 1,
    position: 0,
    version_id: 'v2',
    score: 0,
  },
]

function localLexicalSearch(
  question: string,
  chunks: BenchmarkChunk[],
  topK: number,
  scope?: { versionIds?: string[]; chapters?: number[]; chunkIds?: string[] },
): BenchmarkChunk[] {
  const terms = buildRetrievalTerms(question).map((term) => term.toLocaleLowerCase())
  const versionIds = new Set(scope?.versionIds ?? [])
  const chapters = new Set(scope?.chapters ?? [])
  const chunkIds = new Set(scope?.chunkIds ?? [])

  return chunks
    .filter((chunk) => versionIds.size === 0 || versionIds.has(chunk.version_id))
    .filter((chunk) => chapters.size === 0 || chapters.has(chunk.chapter))
    .filter((chunk) => chunkIds.size === 0 || chunkIds.has(chunk.id))
    .map((chunk) => {
      const text = chunk.content.toLocaleLowerCase()
      const matchedTerms = terms.filter((term) => text.includes(term)).length
      return { chunk, matchedTerms }
    })
    .filter(({ matchedTerms }) => terms.length > 0 && matchedTerms === terms.length)
    .sort((left, right) => {
      if (right.matchedTerms !== left.matchedTerms) return right.matchedTerms - left.matchedTerms
      return left.chunk.position - right.chunk.position
    })
    .slice(0, Math.max(1, topK))
    .map(({ chunk }, index) => ({ ...chunk, score: topK - index }))
}

describe('offline Retrieval benchmark', () => {
  it('achieves full top-1 recall for the representative lexical questions', () => {
    const cases = [
      { question: 'Leo, Cabinet', expected: 'v1-c0' },
      { question: 'Raven tower', expected: 'v1-c2' },
      { question: 'glass Cabinet', expected: 'v2-c0' },
    ]

    const hits = cases.map(({ question, expected }) => {
      const result = localLexicalSearch(question, corpus, 1)
      return result[0]?.id === expected
    })
    const recallAt1 = hits.filter(Boolean).length / cases.length

    console.info(`[retrieval benchmark] recall@1=${recallAt1.toFixed(2)} (${hits.length}/${cases.length})`)
    expect(recallAt1).toBe(1)
  })

  it('keeps source scope isolated before ranking', () => {
    const result = localLexicalSearch('Cabinet', corpus, 5, { versionIds: ['v2'] })

    expect(result.map((chunk) => chunk.id)).toEqual(['v2-c0'])
    expect(result.every((chunk) => chunk.version_id === 'v2')).toBe(true)
  })

  it('preserves primary hits and adds adjacent context without duplicates', () => {
    const [primary] = localLexicalSearch('Leo Cabinet', corpus, 1)
    const adjacent = corpus
      .filter((chunk) => chunk.version_id === primary.version_id && adjacentPositions(primary.position).includes(chunk.position))
      .map((chunk) => ({ ...chunk, score: 0.5 }))

    const expanded = mergeAdjacentRetrievalChunks([primary], adjacent, 1)

    expect(expanded.map((chunk) => chunk.id)).toEqual(['v1-c0', 'v1-c1'])
    expect(new Set(expanded.map((chunk) => chunk.id)).size).toBe(expanded.length)
    expect(expanded[0].id).toBe(primary.id)
  })
})
