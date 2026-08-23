import { supabase } from '@/lib/supabase'

export interface Relationship {
  id: string
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  review_status: 'pending' | 'approved' | 'rejected'
  base_exists: boolean
  operation?: 'add' | 'remove'
}

/**
 * Fetch all relationships touching an entity (outgoing and incoming).
 * The database keeps one directed edge; the profile view exposes that edge
 * from either endpoint so mutual character relationships are visible to both.
 */
export async function getEntityRelationships(
  entityId: string,
  projectId: string,
  branchId?: string,
): Promise<Relationship[]> {
  const loadScope = async (scopeBranchId: string | null) => {
    let query = supabase
      .from('knowledge_entity_relationships')
      .select('*')
      .eq('project_id', projectId)
      .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)

    query = scopeBranchId === null
      ? query.is('branch_id', null)
      : query.eq('branch_id', scopeBranchId)

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  const rows = branchId
    ? [...await loadScope(branchId), ...await loadScope(null)]
    : await loadScope(null)

  // Prefer the Branch proposal/override over Main for the same directed edge.
  const seen = new Set<string>()
  return rows.filter(rel => {
    const key = `${rel.source_entity_id}:${rel.target_entity_id}:${rel.relationship_type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Create a new relationship in a Branch
 * Queries Main to calculate base_exists
 */
export async function createBranchRelationship(
  projectId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  branchId: string
): Promise<Relationship> {
  // Query Main to see if this relationship already exists
  const { data: baseRel } = await supabase
    .from('knowledge_entity_relationships')
    .select('id')
    .eq('project_id', projectId)
    .is('branch_id', null)
    .eq('source_entity_id', sourceEntityId)
    .eq('target_entity_id', targetEntityId)
    .eq('relationship_type', relationshipType)
    .maybeSingle()

  const { data, error } = await supabase
    .from('knowledge_entity_relationships')
    .insert({
      project_id: projectId,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      relationship_type: relationshipType,
      branch_id: branchId,
      operation: 'add',
      review_status: 'pending',
      base_exists: !!baseRel,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

/**
 * Review a pending relationship (approve or reject)
 */
export async function reviewBranchRelationship(
  relationshipId: string,
  approved: boolean
): Promise<void> {
  const { error } = await supabase
    .from('knowledge_entity_relationships')
    .update({ review_status: approved ? 'approved' : 'rejected' })
    .eq('id', relationshipId)

  if (error) throw error
}

/**
 * Create a "remove" proposal for an existing Main relationship
 */
export async function removeBranchRelationship(
  relationshipId: string,
  branchId: string
): Promise<Relationship> {
  // First fetch the original relationship to get source/target/type
  const { data: original, error: fetchError } = await supabase
    .from('knowledge_entity_relationships')
    .select('*')
    .eq('id', relationshipId)
    .single()

  if (fetchError) throw fetchError

  // Create a remove proposal in the Branch
  const { data, error } = await supabase
    .from('knowledge_entity_relationships')
    .insert({
      project_id: original.project_id,
      source_entity_id: original.source_entity_id,
      target_entity_id: original.target_entity_id,
      relationship_type: original.relationship_type,
      branch_id: branchId,
      operation: 'remove',
      review_status: 'pending',
      base_exists: true,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

/**
 * Get the effective relationships for a Branch
 * Combines Main + Branch with operation logic
 */
export async function getEffectiveBranchRelationships(
  projectId: string,
  branchId: string
): Promise<Relationship[]> {
  const { data: mainRels } = await supabase
    .from('knowledge_entity_relationships')
    .select('*')
    .eq('project_id', projectId)
    .is('branch_id', null)
    .eq('review_status', 'approved')

  const { data: branchRels } = await supabase
    .from('knowledge_entity_relationships')
    .select('*')
    .eq('project_id', projectId)
    .eq('branch_id', branchId)
    .eq('review_status', 'approved')

  const effective = new Map<string, Relationship>()

  // Add all approved Main relationships
  for (const rel of mainRels || []) {
    const key = `${rel.source_entity_id}:${rel.target_entity_id}:${rel.relationship_type}`
    effective.set(key, rel)
  }

  // Apply Branch operations
  for (const rel of branchRels || []) {
    const key = `${rel.source_entity_id}:${rel.target_entity_id}:${rel.relationship_type}`
    if (rel.operation === 'remove') {
      effective.delete(key)
    } else if (rel.operation === 'add') {
      effective.set(key, rel)
    }
  }

  return Array.from(effective.values())
}
