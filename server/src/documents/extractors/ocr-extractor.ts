// ============================================
// OCR Extractor
// Uses tesseract.js (free, local) for scanned PDFs.
// Supports Hebrew via 'heb' trained data.
// This is a fallback when PdfTextExtractor detects a scanned document.
// ============================================

import * as Tesseract from 'tesseract.js'
import type { TextExtractor, ExtractionResult, ExtractedPage } from './types.js'

/**
 * OCR Extractor using Tesseract.js.
 * Processes PDF page images through OCR.
 * 
 * Note: For scanned PDFs, the buffer needs to be converted to images first.
 * In the MVP, we use Tesseract directly on the PDF buffer (tesseract.js 
 * supports PDF input via its pdf.js integration).
 * For better results in production, consider pre-rendering pages to PNG.
 */
export class OcrExtractor implements TextExtractor {
  readonly name = 'ocr-tesseract'
  readonly supportedTypes = ['application/pdf']

  private languages: string

  constructor(languages: string = 'eng+heb') {
    this.languages = languages
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now()

    try {
      // Tesseract.js can work with image buffers.
      // For scanned PDFs, we process the buffer as-is.
      // tesseract.js v5+ recognize() accepts Buffer directly for single-page images.
      // For multi-page PDFs, a more sophisticated approach (page-by-page rendering) would be needed.
      const worker = await Tesseract.createWorker(this.languages)

      // Recognize text from the buffer
      const result = await worker.recognize(buffer)
      await worker.terminate()

      const fullText = result.data.text || ''
      const confidence = result.data.confidence || 0

      // For OCR, we treat the result as a single page unless we can detect page breaks
      const pages: ExtractedPage[] = this.splitOcrResult(fullText)
      const totalPages = pages.length

      const avgCharsPerPage = totalPages > 0
        ? pages.reduce((sum, p) => sum + p.text.length, 0) / totalPages
        : 0

      const extractionTimeMs = Date.now() - startTime

      return {
        pages,
        totalPages,
        isScanned: true, // By definition — this extractor is for scanned docs
        fullText,
        detectedLanguage: this.detectLanguage(fullText),
        metadata: {
          extractorUsed: this.name,
          extractionTimeMs,
          averageCharsPerPage: Math.round(avgCharsPerPage),
          ocrConfidence: confidence,
        } as ExtractionResult['metadata'] & { ocrConfidence: number },
      }
    } catch (error) {
      const extractionTimeMs = Date.now() - startTime
      throw new Error(
        `OCR extraction failed after ${extractionTimeMs}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Split OCR result into pseudo-pages.
   * OCR often produces a single text block; we split by large gaps or form-feeds.
   */
  private splitOcrResult(text: string): ExtractedPage[] {
    // Try form-feed split first
    const parts = text.split('\f').filter(p => p.trim().length > 0)

    if (parts.length > 1) {
      return parts.map((content, i) => ({
        pageNumber: i + 1,
        text: content.trim(),
      }))
    }

    // If no page breaks detected, treat as single page
    if (text.trim().length === 0) {
      return []
    }

    return [{
      pageNumber: 1,
      text: text.trim(),
    }]
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
