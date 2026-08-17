// ============================================
// Hybrid Chunker
// Takes a DocumentStructure and produces chunks with rich metadata.
// Strategy: iterate chapters → scenes → paragraphs, accumulate
// into chunks respecting max/min token limits with overlap.
// Configurable via environment variables.
// Works correctly with Hebrew and mixed-language text.
// ============================================

import type { DocumentStructure, StructuredChapter } from './structure-detector.js'

/**
 * Configuration for the chunker.
 * All values can be overridden via environment variables.
 */
export interface ChunkerConfig {
  maxTokens: number      // Maximum tokens per chunk (default: 800)
  minTokens: number      // Minimum tokens per chunk — merge small ones (default: 50)
  overlapTokens: number  // Overlap between consecutive chunks when splitting (default: 100)
}

/**
 * A chunk produced by the chunker.
 * Contains the text content and rich metadata for source tracing.
 */
export interface DocumentChunk {
  content: string
  chapterNumber: number | null
  chapterTitle: string | null
  position: number         // sequential position in the document
  sceneBreak: boolean      // true if this chunk starts a new scene
  tokenCount: number
  metadata: {
    paragraphCount: number
    isOverlapChunk: boolean  // true if content is partially overlap from previous
    startLine?: number
  }
}

/**
 * Load chunker configuration from environment variables.
 */
export function loadChunkerConfig(): ChunkerConfig {
  return {
    maxTokens: parseInt(process.env.CHUNK_MAX_TOKENS || '800', 10),
    minTokens: parseInt(process.env.CHUNK_MIN_TOKENS || '50', 10),
    overlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS || '100', 10),
  }
}

/**
 * Estimate token count for text.
 * Simple word-based approximation:
 * - English: ~1 token per word
 * - Hebrew: ~1.5 tokens per word (Hebrew words tend to be token-dense)
 * This is a rough estimate. For precise counting, use tiktoken.
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) return 0

  // Count words (split on whitespace)
  const words = text.trim().split(/\s+/)
  const wordCount = words.length

  // Check Hebrew ratio to adjust estimate
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length
  const totalChars = text.length
  const hebrewRatio = totalChars > 0 ? hebrewChars / totalChars : 0

  // Adjust: Hebrew text tends to be ~1.5 tokens per word
  const multiplier = 1 + (hebrewRatio * 0.5)

  return Math.ceil(wordCount * multiplier)
}

/**
 * Split text into tokens (word-level) for overlap calculation.
 * Returns an array of "words" that can be rejoined.
 */
function splitToWords(text: string): string[] {
  return text.split(/(\s+)/).filter(s => s.length > 0)
}

/**
 * Take the last N tokens worth of text from a string.
 */
function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= overlapTokens) return text
  return words.slice(-overlapTokens).join(' ')
}

/**
 * Main chunking function.
 * Takes a DocumentStructure and produces chunks with metadata.
 */
export function chunkDocument(
  structure: DocumentStructure,
  config?: Partial<ChunkerConfig>
): DocumentChunk[] {
  const cfg: ChunkerConfig = {
    ...loadChunkerConfig(),
    ...config,
  }

  const chunks: DocumentChunk[] = []
  let position = 0

  for (const chapter of structure.chapters) {
    const chapterChunks = chunkChapter(chapter, cfg, position)
    chunks.push(...chapterChunks)
    position += chapterChunks.length
  }

  return chunks
}

/**
 * Chunk a single chapter.
 */
function chunkChapter(
  chapter: StructuredChapter,
  config: ChunkerConfig,
  startPosition: number
): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  let position = startPosition

  for (let sceneIdx = 0; sceneIdx < chapter.scenes.length; sceneIdx++) {
    const scene = chapter.scenes[sceneIdx]
    const isNewScene = sceneIdx > 0

    // Accumulate paragraphs into chunks
    let currentText = ''
    let currentTokens = 0
    let paragraphCount = 0
    let chunkIsSceneBreak = isNewScene

    for (let paraIdx = 0; paraIdx < scene.paragraphs.length; paraIdx++) {
      const paragraph = scene.paragraphs[paraIdx]
      const paraTokens = estimateTokens(paragraph)

      // If single paragraph exceeds max, split it with overlap
      if (paraTokens > config.maxTokens) {
        // Flush current accumulator first
        if (currentText.trim().length > 0 && currentTokens >= config.minTokens) {
          chunks.push({
            content: currentText.trim(),
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            position: position++,
            sceneBreak: chunkIsSceneBreak,
            tokenCount: currentTokens,
            metadata: {
              paragraphCount,
              isOverlapChunk: false,
              startLine: scene.startsAtLine,
            },
          })
          chunkIsSceneBreak = false
        }

        // Split the long paragraph
        const splitChunks = splitLongText(paragraph, config, chapter, position, scene.startsAtLine)
        for (const sc of splitChunks) {
          sc.sceneBreak = chunkIsSceneBreak
          chunkIsSceneBreak = false
          chunks.push(sc)
          position++
        }

        // Reset accumulator
        currentText = ''
        currentTokens = 0
        paragraphCount = 0
        continue
      }

      // Would adding this paragraph exceed max?
      if (currentTokens + paraTokens > config.maxTokens && currentText.trim().length > 0) {
        // Flush current chunk
        chunks.push({
          content: currentText.trim(),
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          position: position++,
          sceneBreak: chunkIsSceneBreak,
          tokenCount: currentTokens,
          metadata: {
            paragraphCount,
            isOverlapChunk: false,
            startLine: scene.startsAtLine,
          },
        })
        chunkIsSceneBreak = false

        // Start new chunk (no overlap between paragraph-level chunks)
        currentText = paragraph
        currentTokens = paraTokens
        paragraphCount = 1
      } else {
        // Accumulate
        currentText += (currentText ? '\n\n' : '') + paragraph
        currentTokens += paraTokens
        paragraphCount++
      }
    }

    // Flush remaining text in this scene
    if (currentText.trim().length > 0) {
      // If it's too small, it will still be saved (better to have small chunk than lose text)
      chunks.push({
        content: currentText.trim(),
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        position: position++,
        sceneBreak: chunkIsSceneBreak,
        tokenCount: currentTokens,
        metadata: {
          paragraphCount,
          isOverlapChunk: false,
          startLine: scene.startsAtLine,
        },
      })
    }
  }

  return chunks
}

/**
 * Split a long text (single paragraph that exceeds maxTokens) into
 * multiple chunks with overlap.
 */
function splitLongText(
  text: string,
  config: ChunkerConfig,
  chapter: StructuredChapter,
  startPosition: number,
  startLine?: number
): DocumentChunk[] {
  const words = text.split(/\s+/)
  const chunks: DocumentChunk[] = []
  let position = startPosition
  let wordIdx = 0

  while (wordIdx < words.length) {
    // Take maxTokens worth of words
    const endIdx = Math.min(wordIdx + config.maxTokens, words.length)
    const chunkWords = words.slice(wordIdx, endIdx)
    const chunkText = chunkWords.join(' ')
    const tokenCount = estimateTokens(chunkText)

    chunks.push({
      content: chunkText,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      position: position++,
      sceneBreak: false,
      tokenCount,
      metadata: {
        paragraphCount: 1,
        isOverlapChunk: wordIdx > 0, // subsequent chunks are overlap-extended
        startLine,
      },
    })

    // Move forward, leaving overlap
    const step = config.maxTokens - config.overlapTokens
    wordIdx += step > 0 ? step : config.maxTokens
  }

  return chunks
}

/**
 * Merge very small consecutive chunks that belong to the same chapter.
 * Call this as a post-processing step if needed.
 */
export function mergeSmallChunks(chunks: DocumentChunk[], minTokens: number): DocumentChunk[] {
  if (chunks.length <= 1) return chunks

  const merged: DocumentChunk[] = []
  let accumulator: DocumentChunk | null = null

  for (const chunk of chunks) {
    if (!accumulator) {
      accumulator = { ...chunk }
      continue
    }

    // Only merge if same chapter and both are small
    const sameChapter = accumulator.chapterNumber === chunk.chapterNumber
    const accTooSmall = accumulator.tokenCount < minTokens
    const chunkTooSmall = chunk.tokenCount < minTokens

    if (sameChapter && (accTooSmall || chunkTooSmall)) {
      // Merge
      accumulator.content += '\n\n' + chunk.content
      accumulator.tokenCount += chunk.tokenCount
      accumulator.metadata.paragraphCount += chunk.metadata.paragraphCount
    } else {
      merged.push(accumulator)
      accumulator = { ...chunk }
    }
  }

  if (accumulator) {
    merged.push(accumulator)
  }

  return merged
}
