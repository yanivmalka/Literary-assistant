export type ExtractionModelProfile = 'legacy' | 'experimental'

export const DEFAULT_EXTRACTION_MODEL_PROFILE: ExtractionModelProfile = 'legacy'

export const EXTRACTION_MODEL_PROFILES: readonly ExtractionModelProfile[] = [
  'legacy',
  'experimental',
]
