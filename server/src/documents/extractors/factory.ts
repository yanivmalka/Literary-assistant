// ============================================
// Extractor Factory
// Selects the appropriate extractor based on file type.
// For PDF: first tries text extraction, falls back to OCR if scanned.
// ============================================

import type { ExtractionResult } from './types.js'
import { PdfTextExtractor } from './pdf-extractor.js'
import { OcrExtractor } from './ocr-extractor.js'
import { DocxExtractor } from './docx-extractor.js'

const pdfExtractor = new PdfTextExtractor()
const ocrExtractor = new OcrExtractor()
const docxExtractor = new DocxExtractor()

/**
 * Extract text from a document buffer.
 * Automatically selects the right extractor based on file type.
 * For PDFs: tries text extraction first, falls back to OCR if scanned.
 */
export async function extractDocument(
  buffer: Buffer,
  fileType: 'pdf' | 'docx'
): Promise<ExtractionResult> {
  if (fileType === 'docx') {
    return docxExtractor.extract(buffer)
  }

  // For PDF: try text extraction first
  const textResult = await pdfExtractor.extract(buffer)

  // If the PDF appears to be scanned (very little text), try OCR
  if (textResult.isScanned) {
    console.log(
      `PDF detected as scanned (avg ${textResult.metadata.averageCharsPerPage} chars/page). Attempting OCR...`
    )

    try {
      const ocrResult = await ocrExtractor.extract(buffer)

      // Use OCR result only if it produced meaningful text
      if (ocrResult.fullText.trim().length > textResult.fullText.trim().length) {
        return ocrResult
      }
    } catch (error) {
      console.warn('OCR extraction failed, using text extraction result:', error)
    }
  }

  return textResult
}

export { PdfTextExtractor, OcrExtractor, DocxExtractor }
export type { TextExtractor, ExtractionResult, ExtractedPage } from './types.js'
