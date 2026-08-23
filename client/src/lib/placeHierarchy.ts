import { supabase } from '@/lib/supabase'
import type { Entity } from '@/stores/entityStore'

export const CONTAINMENT_RELATIONSHIP_TYPES = ['contained_in', 'parent_of'] as const

export interface PlaceHierarchy {
  parentsByChild: Record<string, string[]>
}

function addParent(map: Map<string, Set<string>>, childId: string, parentId: string): void {
  if (childId === parentId) return
  const parents = map.get(childId) || new Set<string>()
  parents.add(parentId)
  map.set(childId, parents)
}

export async function loadPlaceHierarchy(projectId: string, branchId?: string | null): Promise<PlaceHierarchy> {
  const mainQuery = supabase
    .from('knowledge_entity_relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, operation, review_status, branch_id')
    .eq('project_id', projectId)
    .is('branch_id', null)
    .in('relationship_type', [...CONTAINMENT_RELATIONSHIP_TYPES])

  const branchQuery = branchId
    ? supabase
        .from('knowledge_entity_relationships')
        .select('id, source_entity_id, target_entity_id, relationship_type, operation, review_status, branch_id')
        .eq('project_id', projectId)
        .eq('branch_id', branchId)
        .in('relationship_type', [...CONTAINMENT_RELATIONSHIP_TYPES])
    : Promise.resolve({ data: [], error: null } as any)

  const [{ data: mainRows }, { data: branchRows }] = await Promise.all([mainQuery, branchQuery])
  const effective = new Map<string, any>()

  for (const row of mainRows || []) {
    if ((row.review_status || 'approved') === 'approved' && (row.operation || 'add') === 'add') {
      effective.set(`${row.source_entity_id}:${row.target_entity_id}:${row.relationship_type}`, row)
    }
  }
  for (const row of branchRows || []) {
    if (row.review_status !== 'approved') continue
    const key = `${row.source_entity_id}:${row.target_entity_id}:${row.relationship_type}`
    if (row.operation === 'remove') effective.delete(key)
    else effective.set(key, row)
  }

  const map = new Map<string, Set<string>>()
  for (const row of effective.values()) {
    if (row.relationship_type === 'parent_of') addParent(map, row.target_entity_id, row.source_entity_id)
    else addParent(map, row.source_entity_id, row.target_entity_id)
  }

  return { parentsByChild: Object.fromEntries([...map.entries()].map(([child, parents]) => [child, [...parents]])) }
}

export async function savePlaceContainers(params: {
  projectId: string
  locationId: string
  containerIds: string[]
  branchId?: string | null
}): Promise<void> {
  const { projectId, locationId, containerIds, branchId = null } = params
  const cleanIds = [...new Set(containerIds)].filter(id => id && id !== locationId)

  if (branchId) {
    const existing = await supabase
      .from('knowledge_entity_relationships')
      .select('target_entity_id')
      .eq('project_id', projectId)
      .eq('source_entity_id', locationId)
      .eq('branch_id', branchId)
      .eq('relationship_type', 'contained_in')
      .eq('operation', 'add')

    for (const row of existing.data || []) {
      if (!cleanIds.includes(row.target_entity_id)) {
        await supabase.from('knowledge_entity_relationships').insert({
          project_id: projectId, source_entity_id: locationId, target_entity_id: row.target_entity_id,
          relationship_type: 'contained_in', branch_id: branchId, operation: 'remove', review_status: 'pending', base_exists: true,
        })
      }
    }

    for (const targetId of cleanIds) {
      await supabase.from('knowledge_entity_relationships').insert({
        project_id: projectId, source_entity_id: locationId, target_entity_id: targetId,
        relationship_type: 'contained_in', branch_id: branchId, operation: 'add', review_status: 'pending', base_exists: false,
      })
    }
    return
  }

  const { error: deleteError } = await supabase
    .from('knowledge_entity_relationships')
    .delete()
    .eq('project_id', projectId)
    .eq('source_entity_id', locationId)
    .is('branch_id', null)
    .eq('relationship_type', 'contained_in')
  if (deleteError) throw deleteError

  if (cleanIds.length === 0) return
  const { error } = await supabase.from('knowledge_entity_relationships').insert(
    cleanIds.map(targetId => ({
      project_id: projectId,
      source_entity_id: locationId,
      target_entity_id: targetId,
      relationship_type: 'contained_in',
      operation: 'add',
      review_status: 'approved',
      base_exists: false,
    })),
  )
  if (error) throw error
}

export function getContainerOptions(locations: Entity[], locationId?: string): Entity[] {
  return locations.filter(location => location.id !== locationId && location.entity_type === 'location')
}
