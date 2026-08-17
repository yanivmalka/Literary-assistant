// ============================================
// Document Extraction — Type Definitions
// Common interfaces for all text extractors.
// ============================================

/**
 * A single page of extracted text.
 */
export interface ExtractedPage {
  pageNumber: number
  text: string
}

/**
 * Result of text extraction from a document.
 */
export interface ExtractionResult {
  /** Extracted text pages */
  pages: ExtractedPage[]
  /** Total number of pages in the document */
  totalPages: number
  /** Whether the document appeared to be scanned (images rather than text) */
  isScanned: boolean
  /** Full concatenated text (all pages joined) */
  fullText: string
  /** Detected primary language (best effort) */
  detectedLanguage?: string
  /** Extraction metadata */
  metadata: {
    extractorUsed: string
    extractionTimeMs: number
    averageCharsPerPage: number
  }
}

/**
 * Common interface for all text extractors.
 */
export interface TextExtractor {
  /** Human-readable name of the extractor */
  readonly name: string
  /** Supported MIME types */
  readonly supportedTypes: string[]
  /** Extract text from a file buffer */
  extract(buffer: Buffer, originalName?: string): Promise<ExtractionResult>
}
