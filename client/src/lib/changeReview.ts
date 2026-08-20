import { supabase } from '@/lib/supabase'

export type ChangeType = 'new_entity' | 'field_change' | 'new_relationship' | 'remove_relationship' | 'new_event'

export interface Change {
  id: string
  type: ChangeType
  entity_id?: string
  entity_name?: string
  entity_type?: string
  field?: string
  main_value?: string | null
  branch_value?: string | null
  relationship_id?: string
  relationship_type?: string
  target_entity_id?: string
  target_entity_name?: string
  event_id?: string
  event_name?: string
  branch_id: string
  review_status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

/**
 * Get all pending changes for a Branch
 */
export async function getPendingChanges(
  projectId: string,
  branchId: string
): Promise<Change[]> {
  const changes: Change[] = []

  // New entities in Branch
  const { data: branchEntities } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name, entity_type, branch_id, created_at')
    .eq('project_id', projectId)
    .eq('branch_id', branchId)
    .eq('layer', 'branch')

  for (const entity of branchEntities || []) {
    changes.push({
      id: `entity_${entity.id}`,
      type: 'new_entity',
      entity_id: entity.id,
      entity_name: entity.canonical_name,
      entity_type: entity.entity_type,
      branch_id: branchId,
      review_status: 'pending',
      created_at: entity.created_at,
    })
  }

  // Pending relationships
  const { data: relationships } = await supabase
    .from('knowledge_entity_relationships')
    .select(
      `
      id,
      source_entity_id,
      target_entity_id,
      relationship_type,
      operation,
      review_status,
      created_at
    `
    )
    .eq('project_id', projectId)
    .eq('branch_id', branchId)
    .eq('review_status', 'pending')

  for (const rel of relationships || []) {
    // Fetch source and target names separately
    const { data: sourceEnt } = await supabase
      .from('knowledge_entities')
      .select('canonical_name')
      .eq('id', rel.source_entity_id)
      .single()

    const { data: targetEnt } = await supabase
      .from('knowledge_entities')
      .select('canonical_name')
      .eq('id', rel.target_entity_id)
      .single()

    changes.push({
      id: `rel_${rel.id}`,
      type: rel.operation === 'remove' ? 'remove_relationship' : 'new_relationship',
      relationship_id: rel.id,
      relationship_type: rel.relationship_type,
      target_entity_id: rel.target_entity_id,
      target_entity_name: targetEnt?.canonical_name,
      entity_name: sourceEnt?.canonical_name,
      branch_id: branchId,
      review_status: rel.review_status,
      created_at: rel.created_at,
    })
  }

  // Pending events
  const { data: events } = await supabase
    .from('knowledge_events')
    .select('id, name, branch_id, created_at')
    .eq('project_id', projectId)
    .eq('branch_id', branchId)

  for (const event of events || []) {
    changes.push({
      id: `event_${event.id}`,
      type: 'new_event',
      event_id: event.id,
      event_name: event.name,
      branch_id: branchId,
      review_status: 'pending',
      created_at: event.created_at,
    })
  }

  return changes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/**
 * Approve a change and merge into Main
 */
export async function approveChange(change: Change): Promise<void> {
  if (change.type === 'new_entity') {
    // Update entity layer to main
    await supabase
      .from('knowledge_entities')
      .update({ layer: 'main', branch_id: null })
      .eq('id', change.entity_id)
  } else if (change.type === 'new_relationship' || change.type === 'remove_relationship') {
    // Approve relationship in place (keeps it in Branch, but marks as approved)
    await supabase
      .from('knowledge_entity_relationships')
      .update({ review_status: 'approved' })
      .eq('id', change.relationship_id)
  } else if (change.type === 'new_event') {
    // Events are auto-approved; just mark branch_id to null to promote to Main
    await supabase
      .from('knowledge_events')
      .update({ branch_id: null })
      .eq('id', change.event_id)
  }
}

/**
 * Reject a change (leaves Main unchanged)
 */
export async function rejectChange(change: Change): Promise<void> {
  if (change.type === 'new_entity') {
    // Delete branch entity
    await supabase
      .from('knowledge_entities')
      .delete()
      .eq('id', change.entity_id)
  } else if (change.type === 'new_relationship' || change.type === 'remove_relationship') {
    // Mark as rejected (keeps record for audit trail)
    await supabase
      .from('knowledge_entity_relationships')
      .update({ review_status: 'rejected' })
      .eq('id', change.relationship_id)
  } else if (change.type === 'new_event') {
    // Delete branch event
    await supabase
      .from('knowledge_events')
      .delete()
      .eq('id', change.event_id)
  }
}

/**
 * Detect conflicts when merging (simplified)
 */
export async function detectConflicts(
  projectId: string
): Promise<Array<{ type: string; description: string }>> {
  const conflicts: Array<{ type: string; description: string }> = []

  // Check if Main entity has changed since Branch was created
  const { data: allPendingRels } = await supabase
    .from('knowledge_entity_relationships')
    .select('branch_id, source_entity_id')
    .eq('project_id', projectId)
    .eq('review_status', 'pending')

  void allPendingRels

  const branchCount: Record<string, number> = {}
  for (const rel of allPendingRels || []) {
    const key = `${rel.source_entity_id}`
    branchCount[key] = (branchCount[key] || 0) + 1
  }

  for (const [entityId, count] of Object.entries(branchCount)) {
    if (count > 1) {
      conflicts.push({
        type: 'multi_branch_edit',
        description: `Entity ${entityId} has pending changes in multiple branches`,
      })
    }
  }

  return conflicts
}
