export type ExtractionModelProfile = 'current' | 'development'

export const DEFAULT_EXTRACTION_MODEL_PROFILE: ExtractionModelProfile = 'current'

export const EXTRACTION_MODEL_PROFILES: readonly ExtractionModelProfile[] = [
  'current',
  'development',
]

const EXTRACTION_MODEL_PROFILE_STORAGE_KEY = 'literary-assistant.extraction-model-profile'

export function getStoredExtractionModelProfile(): ExtractionModelProfile {
  if (typeof window === 'undefined') return DEFAULT_EXTRACTION_MODEL_PROFILE
  const stored = window.sessionStorage.getItem(EXTRACTION_MODEL_PROFILE_STORAGE_KEY)
  return stored === 'development' ? 'development' : DEFAULT_EXTRACTION_MODEL_PROFILE
}

export function setStoredExtractionModelProfile(profile: ExtractionModelProfile): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(EXTRACTION_MODEL_PROFILE_STORAGE_KEY, profile)
}
