import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EXTRACTION_STRATEGY,
  getStoredExtractionStrategy,
  isExtractionStrategy,
  setStoredExtractionStrategy,
} from '../extractionModels'

describe('extraction strategy selection', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults missing and invalid stored values to legacy sequential', () => {
    expect(getStoredExtractionStrategy()).toBe(DEFAULT_EXTRACTION_STRATEGY)
    values.set('literary-assistant.extraction-strategy', 'invalid')
    expect(getStoredExtractionStrategy()).toBe('legacy-sequential')
  })

  it('persists the manually selected parallel strategy independently', () => {
    expect(isExtractionStrategy('parallel-experts')).toBe(true)
    setStoredExtractionStrategy('parallel-experts')
    expect(values.get('literary-assistant.extraction-strategy')).toBe('parallel-experts')
    expect(getStoredExtractionStrategy()).toBe('parallel-experts')
  })
})
