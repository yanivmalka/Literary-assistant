import { describe, expect, it } from 'vitest'
import { shouldUseAbilityFallback } from '../abilityProfile'

describe('ability fallback profile isolation', () => {
  it('keeps compatibility fallback disabled for the active profile', () => {
    expect(shouldUseAbilityFallback('current')).toBe(false)
  })

  it('enables compatibility fallback only for development', () => {
    expect(shouldUseAbilityFallback('development')).toBe(true)
  })
})
