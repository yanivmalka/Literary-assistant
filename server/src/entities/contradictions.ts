// ============================================
// Contradiction Detection
// Finds conflicting attribute values for the same entity.
// MVP: attribute_conflict type. Architecture supports future types.
// ============================================

import { getServiceClient } from '../middleware/auth.js'

/**
 * Detect attribute contradictions for all entities in a project.
 * Compares attribute values: if same entity has different values for
 * the same attribute_name, it's a potential contradiction.
 */
export async function detectContradictions(projectId: string): Promise<{
  detected: number
  error?: string
}> {
  const supabase = getServiceClient()

  // Get all entities in the project that have attributes
  const { data: entities } = await supabase
    .from('entities')
    .select('id')
    .eq('project_id', projectId)
    .in('status', ['pending', 'confirmed'])

  if (!entities || entities.length === 0) {
    return { detected: 0 }
  }

  let detected = 0

  for (const entity of entities) {
    const count = await detectContradictionsForEntity(entity.id)
    detected += count
  }

  return { detected }
}

/**
 * Detect contradictions for a single entity.
 * Groups attributes by name and checks for conflicting values.
 */
export async function detectContradictionsForEntity(entityId: string): Promise<number> {
  const supabase = getServiceClient()

  // Get all attributes for this entity
  const { data: attributes } = await supabase
    .from('entity_attributes')
    .select('id, attribute_name, attribute_value, source_chunk_id, confidence')
    .eq('entity_id', entityId)
    .order('attribute_name')

  if (!attributes || attributes.length < 2) {
    return 0
  }

  // Group by attribute_name
  const grouped = new Map<string, typeof attributes>()
  for (const attr of attributes) {
    const key = attr.attribute_name.toLowerCase()
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(attr)
  }

  let detected = 0

  for (const [_attrName, values] of grouped) {
    if (values.length < 2) continue

    // Find unique different values
    const uniqueValues = new Map<string, (typeof attributes)[0]>()
    for (const val of values) {
      const normalized = val.attribute_value.toLowerCase().trim()
      if (!uniqueValues.has(normalized)) {
        uniqueValues.set(normalized, val)
      }
    }

    if (uniqueValues.size < 2) continue

    // Create contradictions for each pair of different values
    const valueList = Array.from(uniqueValues.values())
    for (let i = 0; i < valueList.length; i++) {
      for (let j = i + 1; j < valueList.length; j++) {
        const attrA = valueList[i]
        const attrB = valueList[j]

        // Check if this contradiction already exists
        const { data: existing } = await supabase
          .from('contradictions')
          .select('id')
          .eq('entity_id', entityId)
          .eq('attribute_a_id', attrA.id)
          .eq('attribute_b_id', attrB.id)
          .limit(1)

        if (existing && existing.length > 0) continue

        // Also check reverse order
        const { data: existingReverse } = await supabase
          .from('contradictions')
          .select('id')
          .eq('entity_id', entityId)
          .eq('attribute_a_id', attrB.id)
          .eq('attribute_b_id', attrA.id)
          .limit(1)

        if (existingReverse && existingReverse.length > 0) continue

        // Create contradiction
        const description = `Conflicting values for "${attrA.attribute_name}": "${attrA.attribute_value}" vs "${attrB.attribute_value}"`

        const { error } = await supabase
          .from('contradictions')
          .insert({
            entity_id: entityId,
            attribute_a_id: attrA.id,
            attribute_b_id: attrB.id,
            contradiction_type: 'attribute_conflict',
            status: 'open',
            description,
          })

        if (!error) {
          detected++
        }
      }
    }
  }

  return detected
}

/**
 * Resolve a contradiction with a specific resolution status.
 */
export async function resolveContradiction(
  contradictionId: string,
  status: 'resolved_fix_profile' | 'resolved_fix_text' | 'resolved_intentional' | 'ignored',
  resolutionNote?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient()

  const { error } = await supabase
    .from('contradictions')
    .update({
      status,
      resolution_note: resolutionNote || null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', contradictionId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
