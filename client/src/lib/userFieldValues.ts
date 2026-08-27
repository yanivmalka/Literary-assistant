// ============================================================
// User-edited field-value provenance (Sub-base C and beyond)
// ============================================================
// When a user edits an entity's structured_fields, we persist a matching
// knowledge_entity_values row with source_type: 'user' so a later AI extraction
// cannot silently overwrite that field. These helpers are pure so the diff and
// row shape can be unit-tested independently of the Supabase client.

export interface UserFieldValueWrite {
  field_path: string
  /**
   * JSONB payload for knowledge_entity_values.value_json (a NOT NULL column).
   * Primitives and cleared values are wrapped as `{ value }` / `{ value: null }`
   * so a cleared field is still a storable JSONB value rather than SQL NULL;
   * objects/arrays are stored as-is.
   */
  value_json: unknown
  normalized_value: string | null
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return String(value)
  }
}

function toValueJson(value: unknown): unknown {
  // A cleared field must never become SQL NULL in the NOT NULL value_json
  // column; represent it as the JSONB value { "value": null }.
  if (value === null || value === undefined) {
    return { value: null }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { value }
  }
  return value
}

function toNormalizedValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.toLowerCase().trim()
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return String(value).toLowerCase()
  }
}

/**
 * Returns one write per structured_fields key whose value in `next` differs from
 * `previous`. Keys that are unchanged are omitted, so an edit only claims the
 * fields the user actually touched.
 */
export function diffUserEditedFields(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): UserFieldValueWrite[] {
  const prev = previous || {}
  const writes: UserFieldValueWrite[] = []
  for (const [key, value] of Object.entries(next || {})) {
    if (!key) continue
    if (stableStringify(value) === stableStringify(prev[key])) continue
    writes.push({
      field_path: key,
      value_json: toValueJson(value),
      normalized_value: toNormalizedValue(value),
    })
  }
  return writes
}
