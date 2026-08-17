// ============================================
// Documents Module — Public API
// ============================================

export { extractDocument } from './extractors/index.js'
export type { ExtractionResult, ExtractedPage } from './extractors/index.js'

export { detectStructure } from './structure-detector.js'
export type { DocumentStructure, StructuredChapter, DetectedChapter, DetectedScene } from './structure-detector.js'

export { chunkDocument, mergeSmallChunks, estimateTokens, loadChunkerConfig } from './chunker.js'
export type { DocumentChunk, ChunkerConfig } from './chunker.js'
