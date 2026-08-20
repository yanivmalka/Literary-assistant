// ============================================
// Knowledge-Native Contradiction Detector
// Detects conflicts in canonical values (v1.4+)
// Replaces legacy entity_attributes detector
// ============================================

import { getServiceClient } from '../middleware/auth.js'

interface ContradictionInput {
  projectId: string
  branchId?: string | null
}

interface DetectedContradiction {
  projectId: string
  branchId: string | null
  entityId: string
  fieldPath: string
  valueAId: string
  valueBId: string
  valueA: unknown
  valueB: unknown
  sourceTypeA: 'ai' | 'user'
  sourceTypeB: 'ai' | 'user'
  normalizedA: string
  normalizedB: string
  dedupeKey: string
}

/**
 * Normalize a value to a comparable string for deduplication.
 * Used to create dedupe_key and detect true conflicts.
 */
function normalizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase().trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase()
  }
  if (value === null || value === undefined) {
    return 'null'
  }
  // For objects/arrays, use JSON representation
  return JSON.stringify(value).toLowerCase()
}

/**
 * Create a dedupe key for a potential contradiction.
 * Used to prevent duplicate contradictions on re-extraction.
 * Format: project:branch:entity:field:valueA:valueB (sorted values)
 */
function createDedupeKey(
  projectId: string,
  branchId: string | null,
  entityId: string,
  fieldPath: string,
  normalizedA: string,
  normalizedB: string
): string {
  // Sort normalized values so order doesn't matter
  const [valA, valB] = [normalizedA, normalizedB].sort()
  const scope = branchId ? `branch:${branchId}` : 'main'
  return `${projectId}:${scope}:${entityId}:${fieldPath}:${valA}:${valB}`
}

/**
 * Detect contradictions in Knowledge entity values.
 * Scans all entities in a project/branch for conflicting field values.
 * Returns contradictions that should be saved to knowledge_contradictions.
 */
async function detectValueContradictions(
  input: ContradictionInput
): Promise<{ contradictions: DetectedContradiction[]; errors: string[] }> {
  const supabase = getServiceClient()
  const errors: string[] = []
  const contradictions: DetectedContradiction[] = []

  // Query all active values for entities in this scope
  const { data: allValues, error: queryError } = await supabase
    .from('knowledge_entity_values')
    .select('id, entity_id, field_path, value_json, normalized_value, source_type')
    .eq('project_id', input.projectId)
    .is('branch_id', input.branchId === null ? null : undefined)
    .eq(input.branchId ? 'branch_id' : 'branch_id', input.branchId || null)
    .eq('value_status', 'active')

  if (queryError) {
    errors.push(`Failed to query values: ${queryError.message}`)
    return { contradictions, errors }
  }

  if (!allValues || allValues.length === 0) {
    return { contradictions, errors } // No values to compare
  }

  // Group values by (entity_id, field_path) to find conflicts
  const valuesByField = new Map<string, typeof allValues>()
  for (const value of allValues) {
    const key = `${value.entity_id}:${value.field_path}`
    if (!valuesByField.has(key)) {
      valuesByField.set(key, [])
    }
    valuesByField.get(key)!.push(value)
  }

  // For each field with multiple values, detect contradictions
  for (const [fieldKey, values] of valuesByField.entries()) {
    if (values.length < 2) {
      continue // No conflict: only one value for this field
    }

    const [entityId, fieldPath] = fieldKey.split(':')

    // Check all pairs of values for conflicts
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const valA = values[i]
        const valB = values[j]

        // User values never contradict user values (they're the same source)
        if (valA.source_type === 'user' && valB.source_type === 'user') {
          continue
        }

        // User value always takes precedence; no contradiction
        if (valA.source_type === 'user' || valB.source_type === 'user') {
          continue
        }

        // Both are AI values; check if they actually conflict
        const normA = normalizeValue(valA.value_json)
        const normB = normalizeValue(valB.value_json)

        if (normA === normB) {
          continue // Same value, no conflict
        }

        // True conflict: two different AI values for same field
        const dedupeKey = createDedupeKey(
          input.projectId,
          input.branchId || null,
          entityId,
          fieldPath,
          normA,
          normB
        )

        contradictions.push({
          projectId: input.projectId,
          branchId: input.branchId || null,
          entityId,
          fieldPath,
          valueAId: valA.id,
          valueBId: valB.id,
          valueA: valA.value_json,
          valueB: valB.value_json,
          sourceTypeA: valA.source_type,
          sourceTypeB: valB.source_type,
          normalizedA: normA,
          normalizedB: normB,
          dedupeKey,
        })
      }
    }
  }

  return { contradictions, errors }
}

/**
 * Save detected contradictions to knowledge_contradictions table.
 * Uses dedupe_key to prevent duplicate contradictions on re-detection.
 * Only saves contradictions that don't already exist with same dedupe_key.
 */
async function saveContradictions(
  contradictions: DetectedContradiction[]
): Promise<{ saved: number; skipped: number; errors: string[] }> {
  const supabase = getServiceClient()
  const errors: string[] = []
  let saved = 0
  let skipped = 0

  for (const contra of contradictions) {
    // Check if this contradiction already exists (by dedupe_key)
    const { data: existing, error: checkError } = await supabase
      .from('knowledge_contradictions')
      .select('id, status')
      .eq('project_id', contra.projectId)
      .is('branch_id', contra.branchId)
      .eq('entity_id', contra.entityId)
      .eq('dedupe_key', contra.dedupeKey)
      .maybeSingle()

    if (checkError) {
      errors.push(
        `Failed to check existing contradiction for ${contra.dedupeKey}: ${checkError.message}`
      )
      continue
    }

    if (existing) {
      // Contradiction already exists; skip to avoid duplicates
      skipped++
      continue
    }

    // Insert new contradiction
    const { error: insertError } = await supabase
      .from('knowledge_contradictions')
      .insert({
        project_id: contra.projectId,
        branch_id: contra.branchId,
        entity_id: contra.entityId,
        field_path: contra.fieldPath,
        value_a_id: contra.valueAId,
        value_b_id: contra.valueBId,
        contradiction_type: 'attribute_conflict',
        status: 'open',
        dedupe_key: contra.dedupeKey,
      })

    if (insertError) {
      errors.push(
        `Failed to save contradiction for ${contra.dedupeKey}: ${insertError.message}`
      )
      continue
    }

    saved++
  }

  return { saved, skipped, errors }
}

/**
 * Main entry point: detect and save contradictions for a project/branch.
 */
export async function detectAndSaveContradictions(
  input: ContradictionInput
): Promise<{ success: boolean; detected: number; saved: number; skipped: number; errors: string[] }> {
  const detectResult = await detectValueContradictions(input)
  if (detectResult.errors.length > 0) {
    return {
      success: false,
      detected: 0,
      saved: 0,
      skipped: 0,
      errors: detectResult.errors,
    }
  }

  const saveResult = await saveContradictions(detectResult.contradictions)

  return {
    success: saveResult.errors.length === 0,
    detected: detectResult.contradictions.length,
    saved: saveResult.saved,
    skipped: saveResult.skipped,
    errors: saveResult.errors,
  }
}
