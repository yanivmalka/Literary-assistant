// ============================================
// PDF Text Extractor
// Uses pdf-parse v2 (free) for textual PDFs.
// Detects if a PDF is scanned (low text content per page).
// ============================================

import { PDFParse } from 'pdf-parse'
import type { TextExtractor, ExtractionResult, ExtractedPage } from './types.js'

/**
 * Threshold: if average characters per page is below this,
 * the PDF is likely scanned (images) rather than text-based.
 */
const SCANNED_THRESHOLD_CHARS_PER_PAGE = 50

export class PdfTextExtractor implements TextExtractor {
  readonly name = 'pdf-text'
  readonly supportedTypes = ['application/pdf']

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now()

    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const textResult = await parser.getText()
    await parser.destroy()

    const totalPages = textResult.total
    const fullText = textResult.text || ''

    // pdf-parse v2 gives us per-page text
    const pages: ExtractedPage[] = textResult.pages
      .filter(p => p.text.trim().length > 0)
      .map(p => ({
        pageNumber: p.num,
        text: p.text.trim(),
      }))

    const avgCharsPerPage = totalPages > 0
      ? pages.reduce((sum, p) => sum + p.text.length, 0) / totalPages
      : 0

    const isScanned = avgCharsPerPage < SCANNED_THRESHOLD_CHARS_PER_PAGE

    const extractionTimeMs = Date.now() - startTime

    return {
      pages,
      totalPages,
      isScanned,
      fullText,
      detectedLanguage: this.detectLanguage(fullText),
      metadata: {
        extractorUsed: this.name,
        extractionTimeMs,
        averageCharsPerPage: Math.round(avgCharsPerPage),
      },
    }
  }

  /**
   * Simple language detection based on character ranges.
   * Returns 'he' for Hebrew, 'en' for English, 'mixed' for both.
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
