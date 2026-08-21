export type ExtractionModelProfile = 'current' | 'development'

export const DEFAULT_EXTRACTION_MODEL_PROFILE: ExtractionModelProfile = 'current'

export const EXTRACTION_MODEL_PROFILES: readonly ExtractionModelProfile[] = [
  'current',
  'development',
]
