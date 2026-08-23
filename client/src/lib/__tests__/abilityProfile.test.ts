import { describe, expect, it } from 'vitest'
import { shouldUseAbilityFallback } from '../abilityProfile'

describe('ability fallback profile isolation', () => {
  it('keeps compatibility fallback disabled for the active profile', () => {
    expect(shouldUseAbilityFallback('sub-base')).toBe(false)
  })

  it('enables compatibility fallback for the cloned profiles', () => {
    expect(shouldUseAbilityFallback('sub-base-2')).toBe(true)
    expect(shouldUseAbilityFallback('sub-base-locations')).toBe(true)
  })
})
