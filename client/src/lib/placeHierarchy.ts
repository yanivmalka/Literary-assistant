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
  const relationshipTypes = [...CONTAINMENT_RELATIONSHIP_TYPES]

  const rowToChildParent = (row: {
    source_entity_id: string
    target_entity_id: string
    relationship_type: string
  }) => row.relationship_type === 'parent_of'
    ? { childId: row.target_entity_id, parentId: row.source_entity_id }
    : { childId: row.source_entity_id, parentId: row.target_entity_id }
  const edgeKey = (childId: string, parentId: string) => `${childId}:${parentId}`
  const rowKey = (row: { source_entity_id: string; target_entity_id: string; relationship_type: string }) => {
    const { childId, parentId } = rowToChildParent(row)
    return edgeKey(childId, parentId)
  }

  if (branchId) {
    const [mainResult, branchResult] = await Promise.all([
      supabase
        .from('knowledge_entity_relationships')
        .select('source_entity_id, target_entity_id, relationship_type, operation, review_status')
        .eq('project_id', projectId)
        .is('branch_id', null)
        .in('relationship_type', relationshipTypes),
      supabase
        .from('knowledge_entity_relationships')
        .select('source_entity_id, target_entity_id, relationship_type, operation, review_status, branch_id')
        .eq('project_id', projectId)
        .eq('branch_id', branchId)
        .in('relationship_type', relationshipTypes),
    ])
    if (mainResult.error) throw mainResult.error
    if (branchResult.error) throw branchResult.error

    const mainRows = mainResult.data || []
    const branchRows = branchResult.data || []
    const effective = new Map<string, typeof mainRows[number] | typeof branchRows[number]>()
    for (const row of mainRows) {
      if ((row.review_status || 'approved') === 'approved' && (row.operation || 'add') === 'add') effective.set(rowKey(row), row)
    }
    for (const row of branchRows) {
      if (row.review_status !== 'approved') continue
      const key = rowKey(row)
      if (row.operation === 'remove') effective.delete(key)
      else effective.set(key, row)
    }

    const desired = new Set(cleanIds.map(parentId => edgeKey(locationId, parentId)))
    const mainEdges = new Set(mainRows.map(rowKey))
    const branchAdds = new Set(branchRows.filter(row => (row.operation || 'add') === 'add').map(rowKey))
    const branchRemoves = new Set(branchRows.filter(row => row.operation === 'remove').map(rowKey))
    const removals: Record<string, unknown>[] = []
    for (const [key, row] of effective) {
      const { childId } = rowToChildParent(row)
      if (childId !== locationId || desired.has(key) || branchRemoves.has(key)) continue
      removals.push({
        project_id: projectId,
        source_entity_id: row.source_entity_id,
        target_entity_id: row.target_entity_id,
        relationship_type: row.relationship_type,
        branch_id: branchId,
        operation: 'remove',
        review_status: 'pending',
        base_exists: mainEdges.has(key),
      })
    }

    const additions = cleanIds
      .map(parentId => edgeKey(locationId, parentId))
      .filter(key => !effective.has(key) && !branchAdds.has(key))
      .map(key => {
        const [, parentId] = key.split(':')
        return {
          project_id: projectId,
          source_entity_id: locationId,
          target_entity_id: parentId,
          relationship_type: 'contained_in',
          branch_id: branchId,
          operation: 'add',
          review_status: 'pending',
          base_exists: mainEdges.has(key),
        }
      })

    const changes = [...removals, ...additions]
    if (changes.length === 0) return
    const { error } = await supabase.from('knowledge_entity_relationships').insert(changes)
    if (error) throw error
    return
  }

  const { error: deleteContainedError } = await supabase
    .from('knowledge_entity_relationships')
    .delete()
    .eq('project_id', projectId)
    .eq('source_entity_id', locationId)
    .is('branch_id', null)
    .eq('relationship_type', 'contained_in')
  if (deleteContainedError) throw deleteContainedError

  const { error: deleteParentError } = await supabase
    .from('knowledge_entity_relationships')
    .delete()
    .eq('project_id', projectId)
    .eq('target_entity_id', locationId)
    .is('branch_id', null)
    .eq('relationship_type', 'parent_of')
  if (deleteParentError) throw deleteParentError

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

/**
 * Derives a 1-based containment depth for every place from the parent map
 * produced by {@link loadPlaceHierarchy}. A place with no container is level 1;
 * otherwise it is 1 + the deepest of its containers (longest path from a root),
 * so a place that sits inside several containers reports the deepest nesting.
 * Cycles (which the data should never contain) are broken so the walk always
 * terminates. Ids present only as containers are included as roots.
 */
export function computePlaceLevels(parentsByChild: Record<string, string[]>): Record<string, number> {
  const levels: Record<string, number> = {}
  const visiting = new Set<string>()

  const resolve = (id: string): number => {
    if (levels[id] !== undefined) return levels[id]
    const parents = parentsByChild[id] || []
    if (parents.length === 0) {
      levels[id] = 1
      return 1
    }
    if (visiting.has(id)) return 1 // cycle guard
    visiting.add(id)
    let deepestParent = 0
    for (const parentId of parents) {
      deepestParent = Math.max(deepestParent, resolve(parentId))
    }
    visiting.delete(id)
    levels[id] = deepestParent + 1
    return levels[id]
  }

  const ids = new Set<string>(Object.keys(parentsByChild))
  for (const parents of Object.values(parentsByChild)) {
    for (const parentId of parents) ids.add(parentId)
  }
  for (const id of ids) resolve(id)
  return levels
}
