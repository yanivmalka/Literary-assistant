import { describe, it, expect } from 'vitest'
import {
  CHARACTER_FIELD_CATALOG,
  SUB_BASE_C_FIXED_FIELD_KEYS,
  SUB_BASE_C_ADDABLE_FIELD_KEYS,
} from '@/lib/characterSchema'
// Server source of truth for the Sub-base C character contract.
import { CHARACTER_FIELD_KEYS } from '../../../../supabase/functions/_shared/character-specialist'

/**
 * Issue 15 (Phase 5): the Character field set the UI presents as active,
 * addable extraction fields must match the Sub-base C extraction contract
 * (server `CHARACTER_FIELD_KEYS`). Catalog-only extras such as
 * `narrative_impact` and the legacy compatibility keys are filtered out by
 * normalization, so they must not be offered as new extraction fields — but a
 * character that already holds a value for one must still be able to render it.
 */
describe('Character field contract (Issue 15)', () => {
  it('every Sub-base C fixed field key resolves in CHARACTER_FIELD_CATALOG', () => {
    const catalogKeys = new Set(CHARACTER_FIELD_CATALOG.map(field => field.field_key))
    for (const key of SUB_BASE_C_FIXED_FIELD_KEYS) {
      expect(catalogKeys.has(key), `missing catalog entry for '${key}'`).toBe(true)
    }
  })

  it('mirrors the server CHARACTER_FIELD_KEYS length (drift guard)', () => {
    expect(SUB_BASE_C_FIXED_FIELD_KEYS.length).toBe(42)
  })

  it('is exactly the server CHARACTER_FIELD_KEYS set (client/server drift guard)', () => {
    // A field the UI offers as an addable extraction field but the pipeline does
    // not support (or the inverse) is the Issue 15 mismatch. Compare the actual
    // key sets, not just the count, so a same-length swap is still caught.
    expect([...SUB_BASE_C_FIXED_FIELD_KEYS].sort()).toEqual([...CHARACTER_FIELD_KEYS].sort())
  })

  it('catalog-only extras are NOT addable extraction fields', () => {
    for (const key of ['narrative_impact', 'favorite_food', 'dislikes', 'religion_and_beliefs']) {
      expect(CHARACTER_FIELD_CATALOG.some(field => field.field_key === key)).toBe(true)
      expect(SUB_BASE_C_ADDABLE_FIELD_KEYS.has(key)).toBe(false)
    }
  })

  it('name and description remain addable/editable', () => {
    expect(SUB_BASE_C_ADDABLE_FIELD_KEYS.has('name')).toBe(true)
    expect(SUB_BASE_C_ADDABLE_FIELD_KEYS.has('description')).toBe(true)
  })

  it('the addable set is exactly the fixed contract plus name/description', () => {
    expect([...SUB_BASE_C_ADDABLE_FIELD_KEYS].sort()).toEqual(
      [...SUB_BASE_C_FIXED_FIELD_KEYS, 'name', 'description'].sort(),
    )
  })
})
