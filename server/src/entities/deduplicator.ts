// ============================================
// Entity Deduplicator
// Finds duplicate entities within a project using fuzzy matching.
// Generates merge suggestions for user review.
// Does NOT auto-merge when confidence is low.
// ============================================

import { getServiceClient } from '../middleware/auth.js'

/**
 * A merge suggestion for the user to review.
 */
export interface MergeSuggestion {
  entityA: { id: string; name: string; type: string; aliases: string[] }
  entityB: { id: string; name: string; type: string; aliases: string[] }
  confidence: number  // 0-1, how confident we are they're the same
  reason: string
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0))

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

/**
 * Calculate normalized similarity between two strings (0-1).
 */
function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Check if one string is a possessive/inflected form of another.
 * Handles English possessives and common suffixes.
 */
function isPossessiveOrVariant(a: string, b: string): boolean {
  const lower_a = a.toLowerCase()
  const lower_b = b.toLowerCase()

  // English possessive: "Raven's" vs "Raven"
  if (lower_a + "'s" === lower_b || lower_b + "'s" === lower_a) return true
  if (lower_a + "s" === lower_b || lower_b + "s" === lower_a) return true

  // "The X" vs "X"
  if ('the ' + lower_a === lower_b || 'the ' + lower_b === lower_a) return true

  return false
}

/**
 * Check if entity B's name appears in entity A's aliases or vice versa.
 */
function aliasMatch(
  nameA: string,
  aliasesA: string[],
  nameB: string,
  aliasesB: string[]
): boolean {
  const allA = [nameA.toLowerCase(), ...aliasesA.map(a => a.toLowerCase())]
  const allB = [nameB.toLowerCase(), ...aliasesB.map(b => b.toLowerCase())]

  return allA.some(a => allB.includes(a))
}

/**
 * Find potential duplicate entities within a project.
 * Returns merge suggestions sorted by confidence.
 */
export async function findDuplicates(projectId: string): Promise<MergeSuggestion[]> {
  const supabase = getServiceClient()

  // Get all non-dismissed, non-merged entities
  const { data: entities, error } = await supabase
    .from('entities')
    .select('id, name, entity_type, aliases')
    .eq('project_id', projectId)
    .in('status', ['pending', 'confirmed'])
    .order('name')

  if (error || !entities || entities.length === 0) {
    return []
  }

  const suggestions: MergeSuggestion[] = []

  // Compare all pairs (O(n²) but fine for typical project sizes < 1000 entities)
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i]
      const b = entities[j]

      // Only compare same type (character vs character, location vs location)
      if (a.entity_type !== b.entity_type) continue

      const nameA = a.name.toLowerCase()
      const nameB = b.name.toLowerCase()
      const aliasesA: string[] = a.aliases || []
      const aliasesB: string[] = b.aliases || []

      let confidence = 0
      let reason = ''

      // Exact match (case-insensitive)
      if (nameA === nameB) {
        confidence = 1.0
        reason = 'Exact name match (case-insensitive)'
      }
      // Alias match
      else if (aliasMatch(a.name, aliasesA, b.name, aliasesB)) {
        confidence = 0.95
        reason = 'Name appears in aliases of the other entity'
      }
      // Possessive/variant
      else if (isPossessiveOrVariant(a.name, b.name)) {
        confidence = 0.85
        reason = 'Possessive or inflected form detected'
      }
      // High string similarity (e.g., typo or slight variation)
      else {
        const sim = stringSimilarity(nameA, nameB)
        if (sim >= 0.85) {
          confidence = sim * 0.8
          reason = `High name similarity (${Math.round(sim * 100)}%)`
        }
        // Also check if shorter name is contained in longer
        else if (nameA.length >= 3 && nameB.length >= 3) {
          if (nameB.includes(nameA) || nameA.includes(nameB)) {
            confidence = 0.6
            reason = 'One name is contained within the other'
          }
        }
      }

      if (confidence >= 0.5) {
        suggestions.push({
          entityA: { id: a.id, name: a.name, type: a.entity_type, aliases: aliasesA },
          entityB: { id: b.id, name: b.name, type: b.entity_type, aliases: aliasesB },
          confidence,
          reason,
        })
      }
    }
  }

  // Sort by confidence descending
  return suggestions.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Merge two entities. EntityB is merged into EntityA.
 * All mentions and relations of B are transferred to A.
 * B is marked as 'merged' with merged_into_id = A.
 */
export async function mergeEntities(
  entityIdA: string,
  entityIdB: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient()

  // Get both entities
  const { data: entityA } = await supabase
    .from('entities')
    .select('id, name, aliases')
    .eq('id', entityIdA)
    .single()

  const { data: entityB } = await supabase
    .from('entities')
    .select('id, name, aliases')
    .eq('id', entityIdB)
    .single()

  if (!entityA || !entityB) {
    return { success: false, error: 'One or both entities not found' }
  }

  // Merge aliases: add B's name and aliases to A
  const newAliases = [
    ...(entityA.aliases || []),
    entityB.name,
    ...(entityB.aliases || []),
  ].filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate

  // Update A's aliases
  await supabase
    .from('entities')
    .update({ aliases: newAliases })
    .eq('id', entityIdA)

  // Transfer B's mentions to A
  await supabase
    .from('entity_mentions')
    .update({ entity_id: entityIdA })
    .eq('entity_id', entityIdB)

  // Transfer B's attributes to A
  await supabase
    .from('entity_attributes')
    .update({ entity_id: entityIdA })
    .eq('entity_id', entityIdB)

  // Transfer B's relations (both source and target)
  await supabase
    .from('entity_relations')
    .update({ source_entity_id: entityIdA })
    .eq('source_entity_id', entityIdB)

  await supabase
    .from('entity_relations')
    .update({ target_entity_id: entityIdA })
    .eq('target_entity_id', entityIdB)

  // Mark B as merged
  await supabase
    .from('entities')
    .update({ status: 'merged', merged_into_id: entityIdA })
    .eq('id', entityIdB)

  return { success: true }
}
