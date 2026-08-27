import { describe, it, expect } from 'vitest'
import { diffUserEditedFields } from '@/lib/userFieldValues'

describe('diffUserEditedFields', () => {
  it('returns only the keys whose value changed', () => {
    const writes = diffUserEditedFields(
      { hair_color: 'black', age: '30', occupation: 'archivist' },
      { hair_color: 'red', age: '30', occupation: 'archivist' },
    )
    expect(writes.map(w => w.field_path)).toEqual(['hair_color'])
  })

  it('wraps primitive values as { value } and lowercases the normalized form', () => {
    const [write] = diffUserEditedFields({ hair_color: 'black' }, { hair_color: 'Auburn' })
    expect(write.value_json).toEqual({ value: 'Auburn' })
    expect(write.normalized_value).toBe('auburn')
  })

  it('stores arrays/objects as-is and json-normalizes them', () => {
    const [write] = diffUserEditedFields({ hobbies: [] }, { hobbies: ['reading', 'archery'] })
    expect(write.value_json).toEqual(['reading', 'archery'])
    expect(write.normalized_value).toBe('["reading","archery"]')
  })

  it('treats a null/undefined previous map as all-new', () => {
    const writes = diffUserEditedFields(undefined, { first_name: 'Leo', last_name: 'Frost' })
    expect(writes.map(w => w.field_path).sort()).toEqual(['first_name', 'last_name'])
  })

  it('represents a cleared field as JSONB { value: null }, never bare SQL null', () => {
    const [write] = diffUserEditedFields({ scars: 'a long scar' }, { scars: null })
    expect(write.field_path).toBe('scars')
    // knowledge_entity_values.value_json is NOT NULL; a cleared field must still
    // be a storable JSONB value.
    expect(write.value_json).toEqual({ value: null })
    expect(write.normalized_value).toBeNull()
  })

  it('represents an undefined next value the same storable way', () => {
    const [write] = diffUserEditedFields({ scars: 'x' }, { scars: undefined })
    expect(write.value_json).toEqual({ value: null })
  })

  it('returns nothing when the maps are equal', () => {
    expect(diffUserEditedFields({ a: '1', b: '2' }, { a: '1', b: '2' })).toEqual([])
  })
})
