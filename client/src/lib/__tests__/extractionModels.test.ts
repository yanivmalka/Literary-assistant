import { describe, expect, it, vi } from 'vitest'
import {
  EXTRACTION_MODEL_PROFILES,
  getStoredExtractionModelProfile,
  setStoredExtractionModelProfile,
} from '../extractionModels'

describe('extraction model profile selection', () => {
  it('exposes only the four supported sub-base profiles', () => {
    expect(EXTRACTION_MODEL_PROFILES).toEqual([
      'sub-base',
      'sub-base-2',
      'sub-base-locations',
      'sub-base-c-characters',
    ])
  })

  it('persists a selected sub-base profile', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: vi.fn(),
    })

    setStoredExtractionModelProfile('sub-base-c-characters')
    expect(getStoredExtractionModelProfile()).toBe('sub-base-c-characters')
    vi.unstubAllGlobals()
  })
})
