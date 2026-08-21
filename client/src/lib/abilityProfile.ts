import type { ExtractionModelProfile } from './extractionModels'

/** Compatibility ability fallbacks are isolated from the active profile. */
export function shouldUseAbilityFallback(profile: ExtractionModelProfile): boolean {
  return profile === 'development'
}
