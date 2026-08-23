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

export type LegacyExtractionModelProfile = 'current' | 'development'

/**
 * Maps canonical profile IDs to the names used by older deployed Edge Functions.
 * The locations profile has no legacy equivalent, so it uses the development
 * profile's compatible server behavior until the Edge Function is upgraded.
 */
export function getLegacyExtractionModelProfile(
  profile: ExtractionModelProfile,
  extractionMode: 'bootstrap' | 'branch' = 'branch',
): LegacyExtractionModelProfile {
  // Older Edge Functions require `current` for bootstrap runs because those
  // runs have no target Branch. Development is valid only for Branch runs.
  if (extractionMode === 'bootstrap') return 'current'
  return profile === 'sub-base' ? 'current' : 'development'
}

export function shouldUseProfileBranch(profile: ExtractionModelProfile): boolean {
  return profile !== 'sub-base'
}
