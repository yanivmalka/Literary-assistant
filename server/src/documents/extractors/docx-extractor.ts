// ============================================
// DOCX Extractor
// Uses mammoth (free) to extract text from .docx files.
// Preserves paragraph structure for downstream chunking.
// ============================================

import mammoth from 'mammoth'
import type { TextExtractor, ExtractionResult, ExtractedPage } from './types.js'

/**
 * Approximate lines per "page" for DOCX files.
 * DOCX doesn't have a true page concept (it's flow-based),
 * so we create pseudo-pages for consistent metadata.
 */
const LINES_PER_PAGE = 40

export class DocxExtractor implements TextExtractor {
  readonly name = 'docx-mammoth'
  readonly supportedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now()

    // Extract raw text (preserves paragraph breaks as newlines)
    const textResult = await mammoth.extractRawText({ buffer })
    const fullText = textResult.value || ''

    // Also get the HTML version for potential structure analysis
    // (headings become <h1>, <h2>, etc.)
    const htmlResult = await mammoth.convertToHtml({ buffer })
    const html = htmlResult.value || ''

    // Create pseudo-pages from the text
    const pages = this.createPseudoPages(fullText)
    const totalPages = pages.length

    const avgCharsPerPage = totalPages > 0
      ? pages.reduce((sum, p) => sum + p.text.length, 0) / totalPages
      : 0

    const extractionTimeMs = Date.now() - startTime

    // Extract heading structure from HTML for metadata
    const headings = this.extractHeadings(html)

    return {
      pages,
      totalPages,
      isScanned: false, // DOCX is always text-based
      fullText,
      detectedLanguage: this.detectLanguage(fullText),
      metadata: {
        extractorUsed: this.name,
        extractionTimeMs,
        averageCharsPerPage: Math.round(avgCharsPerPage),
        headings,
        warnings: textResult.messages
          .filter(m => m.type === 'warning')
          .map(m => m.message),
      } as ExtractionResult['metadata'] & { headings: string[]; warnings: string[] },
    }
  }

  /**
   * Split text into pseudo-pages based on line count.
   */
  private createPseudoPages(text: string): ExtractedPage[] {
    const lines = text.split('\n')

    if (lines.length === 0) return []

    const pages: ExtractedPage[] = []
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      const pageLines = lines.slice(i, i + LINES_PER_PAGE)
      const pageText = pageLines.join('\n').trim()
      if (pageText.length > 0) {
        pages.push({
          pageNumber: pages.length + 1,
          text: pageText,
        })
      }
    }

    return pages
  }

  /**
   * Extract headings from HTML output for structure detection.
   */
  private extractHeadings(html: string): string[] {
    const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi
    const headings: string[] = []
    let match: RegExpExecArray | null

    while ((match = headingRegex.exec(html)) !== null) {
      // Strip any remaining HTML tags from heading content
      const cleanText = match[1].replace(/<[^>]*>/g, '').trim()
      if (cleanText) {
        headings.push(cleanText)
      }
    }

    return headings
  }

  /**
   * Simple language detection.
   */
  private detectLanguage(text: string): string | undefined {
    const sample = text.slice(0, 2000)
    const hebrewChars = (sample.match(/[\u0590-\u05FF]/g) || []).length
    const latinChars = (sample.match(/[a-zA-Z]/g) || []).length
    const total = hebrewChars + latinChars

    if (total === 0) return undefined
    const hebrewRatio = hebrewChars / total

    if (hebrewRatio > 0.7) return 'he'
    if (hebrewRatio < 0.3) return 'en'
    return 'mixed'
  }
}
