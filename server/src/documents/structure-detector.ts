// ============================================
// Structure Detector
// Identifies chapters, scene breaks, and paragraphs in extracted text.
// Hebrew-aware: detects Hebrew chapter naming patterns.
// ============================================

/**
 * A detected chapter in the document.
 */
export interface DetectedChapter {
  number: number
  title: string | null
  startLine: number       // line index where chapter starts
  endLine: number         // line index where chapter ends (exclusive)
}

/**
 * A scene within a chapter (separated by scene breaks).
 */
export interface DetectedScene {
  paragraphs: string[]
  startsAtLine: number
}

/**
 * Full structure of a detected document.
 */
export interface DocumentStructure {
  chapters: StructuredChapter[]
  totalLines: number
  detectedLanguage?: string
}

/**
 * A chapter with its scenes and paragraphs.
 */
export interface StructuredChapter {
  number: number
  title: string | null
  scenes: DetectedScene[]
  startLine: number
  endLine: number
  pageEstimate?: number
}

// ============================================
// Chapter detection patterns (English + Hebrew)
// ============================================

const CHAPTER_PATTERNS: RegExp[] = [
  // English patterns
  /^chapter\s+(\d+|[ivxlcdm]+)[\s.:–\-]*(.*)$/i,
  /^ch(?:ap)?\.?\s*(\d+)[\s.:–\-]*(.*)$/i,
  /^part\s+(\d+|[ivxlcdm]+)[\s.:–\-]*(.*)$/i,

  // Hebrew patterns
  /^פרק\s+(\d+|[א-ת]{1,2})[\s.:–\-]*(.*)$/,
  /^חלק\s+(\d+|[א-ת]{1,2})[\s.:–\-]*(.*)$/,

  // Standalone number (e.g., "1", "23") — only at start of line, short line
  /^(\d{1,3})\.?$/,

  // Hebrew numbering letters (א, ב, ג... — standalone)
  /^([א-ת])\.?$/,
]

/**
 * Scene break patterns — lines that indicate a scene transition.
 */
const SCENE_BREAK_PATTERNS: RegExp[] = [
  /^\s*\*\s*\*\s*\*\s*$/,         // * * * or ***
  /^\s*[*]{3,}\s*$/,               // ***
  /^\s*[-–—]{3,}\s*$/,             // --- or ———
  /^\s*[#]{3,}\s*$/,               // ###
  /^\s*~{3,}\s*$/,                 // ~~~
  /^\s*[•◦○●]{3,}\s*$/,           // •••
]

/**
 * Convert Hebrew letter to number (א=1, ב=2, ... י=10, כ=20, ...)
 */
function hebrewLetterToNumber(letter: string): number | null {
  const values: Record<string, number> = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'צ': 90,
    'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
  }

  let total = 0
  for (const ch of letter) {
    if (values[ch] !== undefined) {
      total += values[ch]
    } else {
      return null
    }
  }
  return total > 0 ? total : null
}

/**
 * Try to parse a chapter number from a matched string.
 * Handles digits, roman numerals, and Hebrew letters.
 */
function parseChapterNumber(raw: string): number | null {
  // Try plain number
  const num = parseInt(raw, 10)
  if (!isNaN(num)) return num

  // Try Hebrew letter(s)
  const hebrew = hebrewLetterToNumber(raw)
  if (hebrew !== null) return hebrew

  // Try roman numerals (basic)
  const roman = parseRomanNumeral(raw)
  if (roman !== null) return roman

  return null
}

/**
 * Parse basic roman numerals.
 */
function parseRomanNumeral(s: string): number | null {
  const romanValues: Record<string, number> = {
    i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
  }
  const lower = s.toLowerCase()
  let total = 0
  let prev = 0

  for (let i = lower.length - 1; i >= 0; i--) {
    const val = romanValues[lower[i]]
    if (val === undefined) return null
    if (val < prev) {
      total -= val
    } else {
      total += val
    }
    prev = val
  }

  return total > 0 ? total : null
}

/**
 * Detect whether a line is a chapter heading.
 * Returns chapter number and title if detected, null otherwise.
 */
function detectChapterHeading(line: string): { number: number; title: string | null } | null {
  const trimmed = line.trim()

  // Skip empty or very long lines (unlikely to be chapter headings)
  if (trimmed.length === 0 || trimmed.length > 100) return null

  for (const pattern of CHAPTER_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) {
      const rawNumber = match[1]
      const rawTitle = match[2]?.trim() || null
      const num = parseChapterNumber(rawNumber)

      if (num !== null) {
        return { number: num, title: rawTitle && rawTitle.length > 0 ? rawTitle : null }
      }
    }
  }

  return null
}

/**
 * Check if a line is a scene break.
 */
function isSceneBreak(line: string): boolean {
  return SCENE_BREAK_PATTERNS.some(pattern => pattern.test(line))
}

/**
 * Detect the full structure of a document from its extracted text.
 */
export function detectStructure(fullText: string): DocumentStructure {
  const lines = fullText.split('\n')
  const totalLines = lines.length

  // First pass: find all chapter headings
  const chapterStarts: { lineIndex: number; number: number; title: string | null }[] = []

  for (let i = 0; i < lines.length; i++) {
    const heading = detectChapterHeading(lines[i])
    if (heading) {
      // Additional heuristic: chapter heading should be preceded by blank line
      // or be at the very beginning (except for line 0)
      const prevLine = i > 0 ? lines[i - 1].trim() : ''
      if (i === 0 || prevLine === '' || i <= 2) {
        chapterStarts.push({ lineIndex: i, ...heading })
      }
    }
  }

  // If no chapters detected, treat entire document as one chapter
  if (chapterStarts.length === 0) {
    const scenes = detectScenes(lines, 0, lines.length)
    return {
      chapters: [{
        number: 1,
        title: null,
        scenes,
        startLine: 0,
        endLine: lines.length,
      }],
      totalLines,
    }
  }

  // Build chapters from detected headings
  const chapters: StructuredChapter[] = []

  for (let i = 0; i < chapterStarts.length; i++) {
    const start = chapterStarts[i]
    const nextStart = chapterStarts[i + 1]
    const endLine = nextStart ? nextStart.lineIndex : lines.length

    // Content starts after the heading line
    const contentStart = start.lineIndex + 1
    const scenes = detectScenes(lines, contentStart, endLine)

    chapters.push({
      number: start.number,
      title: start.title,
      scenes,
      startLine: start.lineIndex,
      endLine,
    })
  }

  // Handle any content before the first chapter (preamble/prologue)
  if (chapterStarts[0].lineIndex > 0) {
    const preambleLines = lines.slice(0, chapterStarts[0].lineIndex)
    const hasContent = preambleLines.some(l => l.trim().length > 0)
    if (hasContent) {
      const scenes = detectScenes(lines, 0, chapterStarts[0].lineIndex)
      chapters.unshift({
        number: 0,
        title: 'Preamble',
        scenes,
        startLine: 0,
        endLine: chapterStarts[0].lineIndex,
      })
    }
  }

  return { chapters, totalLines }
}

/**
 * Detect scenes within a range of lines.
 * Scenes are separated by scene break patterns or multiple blank lines.
 */
function detectScenes(lines: string[], start: number, end: number): DetectedScene[] {
  const scenes: DetectedScene[] = []
  let currentParagraphs: string[] = []
  let currentParagraph = ''
  let sceneStart = start

  for (let i = start; i < end; i++) {
    const line = lines[i]

    // Scene break?
    if (isSceneBreak(line)) {
      // Flush current paragraph
      if (currentParagraph.trim()) {
        currentParagraphs.push(currentParagraph.trim())
        currentParagraph = ''
      }
      // Save current scene if it has content
      if (currentParagraphs.length > 0) {
        scenes.push({ paragraphs: currentParagraphs, startsAtLine: sceneStart })
        currentParagraphs = []
      }
      sceneStart = i + 1
      continue
    }

    // Multiple consecutive blank lines (3+) also indicate scene break
    if (line.trim() === '') {
      // Check if this is the start of 3+ blank lines
      let blankCount = 1
      let j = i + 1
      while (j < end && lines[j].trim() === '') {
        blankCount++
        j++
      }
      if (blankCount >= 3) {
        // Flush and start new scene
        if (currentParagraph.trim()) {
          currentParagraphs.push(currentParagraph.trim())
          currentParagraph = ''
        }
        if (currentParagraphs.length > 0) {
          scenes.push({ paragraphs: currentParagraphs, startsAtLine: sceneStart })
          currentParagraphs = []
        }
        i = j - 1 // skip blank lines
        sceneStart = j
        continue
      }

      // Single/double blank line = paragraph separator
      if (currentParagraph.trim()) {
        currentParagraphs.push(currentParagraph.trim())
        currentParagraph = ''
      }
      continue
    }

    // Regular line — accumulate into current paragraph
    currentParagraph += (currentParagraph ? '\n' : '') + line
  }

  // Flush remaining
  if (currentParagraph.trim()) {
    currentParagraphs.push(currentParagraph.trim())
  }
  if (currentParagraphs.length > 0) {
    scenes.push({ paragraphs: currentParagraphs, startsAtLine: sceneStart })
  }

  return scenes
}
