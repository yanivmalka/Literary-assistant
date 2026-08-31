import { describe, it, expect } from 'vitest'
import { computePlaceLevels } from '@/lib/placeHierarchy'

describe('computePlaceLevels', () => {
  it('assigns level 1 to roots and increments down a chain', () => {
    // universe -> world -> kingdom -> city
    const levels = computePlaceLevels({
      world: ['universe'],
      kingdom: ['world'],
      city: ['kingdom'],
    })
    expect(levels).toEqual({ universe: 1, world: 2, kingdom: 3, city: 4 })
  })

  it('uses the deepest container when a place has several parents', () => {
    // island sits both directly in the world (depth 1) and in a kingdom (depth 2)
    const levels = computePlaceLevels({
      kingdom: ['world'],
      island: ['world', 'kingdom'],
    })
    expect(levels.island).toBe(3)
  })

  it('includes ids that appear only as containers', () => {
    const levels = computePlaceLevels({ city: ['kingdom'] })
    expect(levels.kingdom).toBe(1)
    expect(levels.city).toBe(2)
  })

  it('terminates and stays finite when the data contains a cycle', () => {
    const levels = computePlaceLevels({ a: ['b'], b: ['a'] })
    expect(Number.isFinite(levels.a)).toBe(true)
    expect(Number.isFinite(levels.b)).toBe(true)
  })

  it('returns an empty map for no edges', () => {
    expect(computePlaceLevels({})).toEqual({})
  })
})
