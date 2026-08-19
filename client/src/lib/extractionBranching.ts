/**
 * AI Extraction Branch Routing
 * 
 * Ensures all AI extractions go to active Branch instead of Main.
 * Enforces:
 * - AI cannot modify Main directly
 * - All extractions routed to branch_id
 * - Branch isolation (no cross-contamination)
 * - Backward compatibility with existing Main layer data
 */

import { supabase } from '@/lib/supabase'

/**
 * Get the active branch for a project
 * Required before any extraction
 * 
 * @throws Error if no active branch exists
 */
export async function getActiveBranch(projectId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .from('knowledge_branches')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('is_current', true)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch active branch: ${error.message}`)
  }

  if (!data) {
    throw new Error('No active branch found. Create or activate a branch before extracting.')
  }

  return data
}

/**
 * Validate extraction request has branch context
 * Must be called before any extraction writes
 */
export function validateBranchContext(branchId: string | null | undefined): void {
  if (!branchId) {
    throw new Error(
      'Extraction rejected: No active branch. ' +
      'AI is not permitted to modify Main directly. ' +
      'Create or activate a Branch first.'
    )
  }
}

/**
 * Create a branch entity from AI extraction
 * 
 * Used when AI extracts a new entity that doesn't exist in Main.
 * Entity is created with layer='branch' and branch_id set.
 */
export async function createBranchEntity(
  projectId: string,
  userId: string,
  branchId: string,
  entityData: {
    canonical_name: string
    entity_type: string
    description?: string | null
    attributes?: Record<string, unknown>
    structured_fields?: Record<string, unknown>
  }
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_entities')
    .insert({
      project_id: projectId,
      user_id: userId,
      layer: 'branch',
      branch_id: branchId,
      source: 'ai',
      ...entityData,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch entity: ${error.message}`)
  }

  return data
}

/**
 * Create overlay for existing Main entity when AI extracts changes
 * 
 * Used when AI extracts data for an entity that already exists in Main.
 * Creates an Overlay record in knowledge_branch_entities with overrides.
 */
export async function createEntityOverlay(
  branchId: string,
  mainEntityId: string,
  overrides: Record<string, unknown>,
  baseValues: Record<string, unknown>
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_branch_entities')
    .insert({
      branch_id: branchId,
      source_entity_id: mainEntityId,
      entity_id: mainEntityId,
      overrides,
      base_values: baseValues,
      is_modified: Object.keys(overrides).length > 0,
      modified_fields: Object.keys(overrides),
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create entity overlay: ${error.message}`)
  }

  return data
}

/**
 * Create alias for branch entity
 * Prevents Main layer aliases from being polluted by branch extractions
 */
export async function createBranchEntityAlias(
  entityId: string,
  alias: string,
  branchId: string
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_entity_aliases')
    .insert({
      entity_id: entityId,
      alias,
      branch_id: branchId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch entity alias: ${error.message}`)
  }

  return data
}

/**
 * Create mention for branch entity
 * Branches have their own evidence/mentions isolated from Main
 */
export async function createBranchEntityMention(
  entityId: string,
  chunkPosition: number,
  evidence: string | null,
  branchId: string
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_entity_mentions')
    .insert({
      entity_id: entityId,
      chunk_position: chunkPosition,
      evidence: evidence || undefined,
      branch_id: branchId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch entity mention: ${error.message}`)
  }

  return data
}

/**
 * Create relationship between entities in same branch
 * Enforces that both entities belong to the same branch
 */
export async function createBranchEntityRelationship(
  projectId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  branchId: string,
  evidence?: string | null,
  chunkPosition?: number | null
) {
  validateBranchContext(branchId)

  // Verify both entities belong to same branch
  const [sourceData, targetData] = await Promise.all([
    supabase
      .from('knowledge_entities')
      .select('branch_id, layer')
      .eq('id', sourceEntityId)
      .single(),
    supabase
      .from('knowledge_entities')
      .select('branch_id, layer')
      .eq('id', targetEntityId)
      .single(),
  ])

  if (sourceData.error || targetData.error) {
    throw new Error('One or both entities not found')
  }

  // Enforce branch boundary: both entities must be in same branch
  const sourceBranch = sourceData.data.branch_id
  const targetBranch = targetData.data.branch_id

  if (
    (sourceBranch && targetBranch && sourceBranch !== targetBranch) ||
    (sourceBranch && !targetBranch) ||
    (!sourceBranch && targetBranch)
  ) {
    throw new Error(
      'Cannot create relationship between entities from different branches. ' +
      'Both entities must belong to the same branch or both to Main.'
    )
  }

  const { data, error } = await supabase
    .from('knowledge_entity_relationships')
    .insert({
      project_id: projectId,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      relationship_type: relationshipType,
      evidence: evidence || undefined,
      chunk_position: chunkPosition || undefined,
      branch_id: branchId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch entity relationship: ${error.message}`)
  }

  return data
}

/**
 * Create event in branch
 * Branch events are isolated from Main
 */
export async function createBranchEvent(
  projectId: string,
  userId: string,
  branchId: string,
  eventData: {
    name: string
    description?: string | null
    attributes?: Record<string, unknown>
  }
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_events')
    .insert({
      project_id: projectId,
      user_id: userId,
      branch_id: branchId,
      ...eventData,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch event: ${error.message}`)
  }

  return data
}

/**
 * Record raw extraction with branch association
 * All extractions must have branch_id set (no Main extractions via AI)
 */
export async function recordRawExtraction(
  projectId: string,
  documentId: string,
  versionId: string,
  userId: string,
  branchId: string,
  extractionData: {
    model: string
    raw_response: Record<string, unknown>
    input_tokens?: number
    output_tokens?: number
    thinking_tokens?: number
    total_tokens?: number
    cached_tokens?: number
    latency_ms?: number
    chunks_count?: number
  }
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('raw_extractions')
    .insert({
      project_id: projectId,
      document_id: documentId,
      version_id: versionId,
      user_id: userId,
      branch_id: branchId,
      ...extractionData,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to record raw extraction: ${error.message}`)
  }

  return data
}

/**
 * Find matching Main entity for branch extraction
 * Used to decide whether to create overlay or new branch entity
 */
export async function findMatchingMainEntity(
  projectId: string,
  canonicalName: string,
  entityType: string
): Promise<{ id: string; canonical_name: string } | null> {
  // Normalize search
  const normalized = canonicalName.toLowerCase().trim()

  const { data, error } = await supabase
    .from('knowledge_entities')
    .select('id, canonical_name')
    .eq('project_id', projectId)
    .eq('layer', 'main')
    .eq('entity_type', entityType)
    .ilike('canonical_name', normalized)
    .maybeSingle()

  if (error) {
    console.error('Error finding matching Main entity:', error)
    return null
  }

  return data
}

/**
 * Get all branch entities with their effective views
 * Useful for UI to show what AI has extracted in this branch
 */
export async function getBranchEntityViews(branchId: string) {
  // Fetch branch entities
  const { data: branchEntities, error: entError } = await supabase
    .from('knowledge_branch_entities')
    .select('*')
    .eq('branch_id', branchId)

  if (entError) {
    throw new Error(`Failed to fetch branch entities: ${entError.message}`)
  }

  // Fetch branch-only entities
  const { data: branchOnlyEntities, error: branchOnlyError } = await supabase
    .from('knowledge_entities')
    .select('*')
    .eq('branch_id', branchId)
    .eq('layer', 'branch')

  if (branchOnlyError) {
    throw new Error(`Failed to fetch branch-only entities: ${branchOnlyError.message}`)
  }

  return {
    overlays: branchEntities || [],
    branchOnly: branchOnlyEntities || [],
  }
}

/**
 * Verify branch isolation: ensure operations don't leak between branches
 */
export async function verifyBranchIsolation(
  entityId: string,
  expectedBranchId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('knowledge_entities')
    .select('branch_id')
    .eq('id', entityId)
    .single()

  if (error) {
    return false
  }

  return data.branch_id === expectedBranchId
}
