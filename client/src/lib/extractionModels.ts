export type ExtractionModelProfile = 'sub-base' | 'sub-base-2' | 'sub-base-locations'

export const DEFAULT_EXTRACTION_MODEL_PROFILE: ExtractionModelProfile = 'sub-base'

export const EXTRACTION_MODEL_PROFILES: readonly ExtractionModelProfile[] = [
  'sub-base',
  'sub-base-2',
  'sub-base-locations',
]

const EXTRACTION_MODEL_PROFILE_STORAGE_KEY = 'literary-assistant.extraction-model-profile'
export const EXTRACTION_MODEL_PROFILE_CHANGED_EVENT = 'literary-assistant.extraction-model-profile-changed'

export function getStoredExtractionModelProfile(): ExtractionModelProfile {
  if (typeof window === 'undefined') return DEFAULT_EXTRACTION_MODEL_PROFILE
  const stored = window.sessionStorage.getItem(EXTRACTION_MODEL_PROFILE_STORAGE_KEY)
  return EXTRACTION_MODEL_PROFILES.includes(stored as ExtractionModelProfile)
    ? stored as ExtractionModelProfile
    : DEFAULT_EXTRACTION_MODEL_PROFILE
}

export function setStoredExtractionModelProfile(profile: ExtractionModelProfile): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(EXTRACTION_MODEL_PROFILE_STORAGE_KEY, profile)
  window.dispatchEvent(new Event(EXTRACTION_MODEL_PROFILE_CHANGED_EVENT))
}

export function shouldUseProfileBranch(profile: ExtractionModelProfile): boolean {
  return profile !== 'sub-base'
}
