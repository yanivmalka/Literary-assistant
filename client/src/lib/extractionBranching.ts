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

export interface BranchEntityData {
  canonical_name: string
  entity_type: string
  description?: string | null
  attributes?: Record<string, unknown>
  structured_fields?: Record<string, unknown>
}

export interface MainEntityRoutingData {
  id: string
  canonical_name: string
  entity_type: string
  description: string | null
  attributes: Record<string, unknown>
  structured_fields: Record<string, unknown>
}

/**
 * Build the exact branch-only entity row used by AI extraction.
 * Branch context is applied last so callers cannot accidentally override it.
 */
export function buildBranchEntityRecord(
  projectId: string,
  userId: string,
  branchId: string,
  entityData: BranchEntityData
): Record<string, unknown> {
  validateBranchContext(branchId)

  return {
    project_id: projectId,
    user_id: userId,
    ...entityData,
    layer: 'branch',
    branch_id: branchId,
    source: 'ai',
  }
}

/**
 * Build an overlay row for an existing Main entity without changing Main.
 */
export function buildEntityOverlayRecord(
  branchId: string,
  mainEntityId: string,
  overrides: Record<string, unknown>,
  baseValues: Record<string, unknown>,
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  validateBranchContext(branchId)

  return {
    ...metadata,
    branch_id: branchId,
    source_entity_id: mainEntityId,
    entity_id: mainEntityId,
    overrides,
    base_values: baseValues,
    is_modified: Object.keys(overrides).length > 0,
    modified_fields: Object.keys(overrides),
  }
}

export function buildBranchEntityAliasRecord(
  entityId: string,
  alias: string,
  branchId: string
): Record<string, unknown> {
  validateBranchContext(branchId)
  return { entity_id: entityId, alias, branch_id: branchId }
}

export function buildBranchEntityMentionRecord(
  entityId: string,
  chunkPosition: number,
  evidence: string | null,
  branchId: string
): Record<string, unknown> {
  validateBranchContext(branchId)
  return {
    entity_id: entityId,
    chunk_position: chunkPosition,
    evidence: evidence || undefined,
    branch_id: branchId,
  }
}

export function buildRawExtractionRecord(
  projectId: string,
  documentId: string,
  versionId: string,
  userId: string,
  branchId: string,
  extractionData: Record<string, unknown>
): Record<string, unknown> {
  validateBranchContext(branchId)
  return {
    project_id: projectId,
    document_id: documentId,
    version_id: versionId,
    user_id: userId,
    branch_id: branchId,
    ...extractionData,
  }
}

export function buildExtractionRequest(
  versionId: string,
  projectId: string,
  documentId: string,
  userId: string,
  branchId: string | null,
  offset: number,
  limit: number
): Record<string, unknown> {
  // If branchId is null, signal to Edge Function to use Main (bootstrap mode)
  // If branchId is provided, use Branch
  if (branchId) {
    validateBranchContext(branchId)
  }

  return {
    version_id: versionId,
    project_id: projectId,
    document_id: documentId,
    user_id: userId,
    target_branch_id: branchId || null,  // null = use Main (bootstrap)
    use_main: branchId === null,         // explicit flag for Edge Function
    offset,
    limit,
  }
}

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
  entityData: BranchEntityData
) {
  const { data, error } = await supabase
    .from('knowledge_entities')
    .insert(buildBranchEntityRecord(projectId, userId, branchId, entityData))
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
  const { data, error } = await supabase
    .from('knowledge_branch_entities')
    .insert(buildEntityOverlayRecord(branchId, mainEntityId, overrides, baseValues))
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
  const { data, error } = await supabase
    .from('knowledge_entity_aliases')
    .insert(buildBranchEntityAliasRecord(entityId, alias, branchId))
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
  const { data, error } = await supabase
    .from('knowledge_entity_mentions')
    .insert(buildBranchEntityMentionRecord(entityId, chunkPosition, evidence, branchId))
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create branch entity mention: ${error.message}`)
  }

  return data
}

export const INITIAL_RELATIONSHIP_TYPES = [
  'owns',
  'uses',
  'located_in',
  'knows',
  'parent_of',
  'involves',
  'occurs_at',
  'contained_in',
] as const

export type RelationshipOperation = 'add' | 'remove'
export type RelationshipReviewStatus = 'pending' | 'approved' | 'rejected'

export interface BranchRelationshipRecord {
  id?: string
  branch_id: string | null
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  operation?: RelationshipOperation
  review_status?: RelationshipReviewStatus
  base_exists?: boolean
  [key: string]: unknown
}

export function validateRelationshipType(relationshipType: string): void {
  if (!(INITIAL_RELATIONSHIP_TYPES as readonly string[]).includes(relationshipType)) {
    throw new Error(`Unsupported relationship type: ${relationshipType}`)
  }
}

export function buildBranchRelationshipRecord(params: {
  projectId: string
  sourceEntityId: string
  targetEntityId: string
  relationshipType: string
  branchId: string
  operation?: RelationshipOperation
  reviewStatus?: RelationshipReviewStatus
  baseExists: boolean
  evidence?: string | null
  chunkPosition?: number | null
  rawExtractionId?: string | null
}): BranchRelationshipRecord {
  validateBranchContext(params.branchId)
  validateRelationshipType(params.relationshipType)

  return {
    project_id: params.projectId,
    source_entity_id: params.sourceEntityId,
    target_entity_id: params.targetEntityId,
    relationship_type: params.relationshipType,
    branch_id: params.branchId,
    operation: params.operation || 'add',
    review_status: params.reviewStatus || 'pending',
    base_exists: params.baseExists,
    evidence: params.evidence || undefined,
    chunk_position: params.chunkPosition ?? undefined,
    raw_extraction_id: params.rawExtractionId || undefined,
  }
}

export function buildRelationshipReviewUpdate(
  reviewStatus: RelationshipReviewStatus
): { review_status: RelationshipReviewStatus } {
  return { review_status: reviewStatus }
}

function relationshipKey(relationship: BranchRelationshipRecord): string {
  return `${relationship.source_entity_id}:${relationship.target_entity_id}:${relationship.relationship_type}`
}

/**
 * Build the effective graph for one Branch without changing Main rows.
 * Pending/rejected proposals remain review data but do not affect the graph.
 */
export function getEffectiveBranchRelationships(
  mainRelationships: BranchRelationshipRecord[],
  branchRelationships: BranchRelationshipRecord[],
  branchId: string
): BranchRelationshipRecord[] {
  validateBranchContext(branchId)
  const effective = new Map<string, BranchRelationshipRecord>()

  for (const relationship of mainRelationships) {
    if (
      relationship.branch_id === null &&
      (relationship.review_status || 'approved') === 'approved' &&
      (relationship.operation || 'add') === 'add'
    ) {
      effective.set(relationshipKey(relationship), relationship)
    }
  }

  for (const relationship of branchRelationships) {
    if (relationship.branch_id !== branchId || relationship.review_status !== 'approved') continue
    const key = relationshipKey(relationship)
    if (relationship.operation === 'remove') {
      effective.delete(key)
    } else if (relationship.operation === 'add') {
      effective.set(key, relationship)
    }
  }

  return Array.from(effective.values())
}

/**
 * Create an independent Branch relationship proposal. Main is only queried to
 * calculate base_exists and is never updated.
 */
export async function createBranchEntityRelationship(
  projectId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  branchId: string,
  evidence?: string | null,
  chunkPosition?: number | null,
  options: {
    operation?: RelationshipOperation
    reviewStatus?: RelationshipReviewStatus
    baseExists?: boolean
    rawExtractionId?: string | null
  } = {}
) {
  const activeBranch = await getActiveBranch(projectId)
  if (activeBranch.id !== branchId) {
    throw new Error('Relationship must target the active Branch')
  }

  const [sourceData, targetData] = await Promise.all([
    supabase
      .from('knowledge_entities')
      .select('branch_id, layer, project_id, user_id')
      .eq('id', sourceEntityId)
      .single(),
    supabase
      .from('knowledge_entities')
      .select('branch_id, layer, project_id, user_id')
      .eq('id', targetEntityId)
      .single(),
  ])

  if (sourceData.error || targetData.error || !sourceData.data || !targetData.data) {
    throw new Error('One or both entities not found')
  }

  for (const entity of [sourceData.data, targetData.data]) {
    if (entity.project_id !== projectId) throw new Error('Entity does not belong to this project')
    if (entity.branch_id && entity.branch_id !== branchId) {
      throw new Error('Cannot create relationship across Branches')
    }
    if (entity.layer === 'branch' && entity.branch_id !== branchId) {
      throw new Error('Branch-only entity does not belong to the requested Branch')
    }
  }

  let baseExists = options.baseExists
  if (baseExists === undefined) {
    const { data: mainRelationship, error: mainError } = await supabase
      .from('knowledge_entity_relationships')
      .select('id')
      .is('branch_id', null)
      .eq('project_id', projectId)
      .eq('source_entity_id', sourceEntityId)
      .eq('target_entity_id', targetEntityId)
      .eq('relationship_type', relationshipType)
      .limit(1)
      .maybeSingle()

    if (mainError) throw new Error(`Failed to inspect Main relationship: ${mainError.message}`)
    baseExists = Boolean(mainRelationship)
  }

  const { data, error } = await supabase
    .from('knowledge_entity_relationships')
    .insert(buildBranchRelationshipRecord({
      projectId,
      sourceEntityId,
      targetEntityId,
      relationshipType,
      branchId,
      operation: options.operation,
      reviewStatus: options.reviewStatus,
      baseExists,
      evidence,
      chunkPosition,
      rawExtractionId: options.rawExtractionId,
    }))
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create Branch relationship: ${error.message}`)
  return data
}

export async function removeBranchEntityRelationship(
  projectId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  branchId: string,
  evidence?: string | null,
  chunkPosition?: number | null
) {
  return createBranchEntityRelationship(
    projectId,
    sourceEntityId,
    targetEntityId,
    relationshipType,
    branchId,
    evidence,
    chunkPosition,
    { operation: 'remove', baseExists: true },
  )
}

export async function reviewBranchRelationship(
  relationshipId: string,
  branchId: string,
  reviewStatus: 'approved' | 'rejected'
) {
  validateBranchContext(branchId)

  const { data, error } = await supabase
    .from('knowledge_entity_relationships')
    .update(buildRelationshipReviewUpdate(reviewStatus))
    .eq('id', relationshipId)
    .eq('branch_id', branchId)
    .select('*')
    .single()

  if (error) throw new Error(`Failed to review Branch relationship: ${error.message}`)
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
  const { data, error } = await supabase
    .from('raw_extractions')
    .insert(buildRawExtractionRecord(
      projectId,
      documentId,
      versionId,
      userId,
      branchId,
      extractionData,
    ))
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


/**
 * Auto-create Main/Branch for Extraction
 * 
 * Bootstrap logic: 
 * - First extraction ever: create Main, write to Main
 * - Subsequent extractions: create Branch if missing, write to Branch
 * - After Main exists: AI never writes to Main again
 */

/**
 * Check if Main layer has any entities for this project
 * Safe check: does NOT create Main
 */
export async function hasMainEntities(projectId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('knowledge_entities')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('layer', 'main')
    .limit(1)

  if (error) {
    console.error('Failed to check main entities:', error)
    return false
  }

  return (data && data.length > 0) || false
}

/**
 * Ensure Main layer exists for project. 
 * Creates exactly one marker entity if Main doesn't exist.
 * 
 * Uses Supabase RLS/constraints to prevent race conditions.
 * If concurrent attempts create duplicate entries, only first succeeds.
 */
export async function ensureMainBootstrapped(projectId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if Main already exists
  const hasMain = await hasMainEntities(projectId)
  if (hasMain) return

  // Try to create bootstrap marker
  // If race condition: another client already created it, query will return empty
  // and we silently continue (Main exists now)
  const { error } = await supabase
    .from('knowledge_entities')
    .insert({
      project_id: projectId,
      user_id: user.id,
      canonical_name: '__bootstrap__',
      entity_type: 'character',
      description: 'Bootstrap marker for Main layer',
      layer: 'main',
      source: 'system',
      attributes: {},
      structured_fields: {},
    })

  // Ignore "duplicate" errors - means another concurrent request created it
  if (error && !error.message.includes('duplicate')) {
    throw error
  }

  console.log('[Knowledge] Main layer bootstrapped for project:', projectId)
}

/**
 * Get or create active Branch for this project.
 * 
 * Uses is_current=true + status=active uniqueness to prevent duplicate active branches.
 * If concurrent attempts: RLS + constraints ensure only one active branch.
 */
export async function getOrCreateActiveBranch(projectId: string): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // First, try to get existing active branch
  const { data: existing, error: fetchError } = await supabase
    .from('knowledge_branches')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('is_current', true)
    .eq('status', 'active')
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to fetch active branch: ${fetchError.message}`)
  }

  if (existing) {
    return { id: existing.id }
  }

  // No active branch exists. Try to create one.
  // If race condition: another client creates it first, we'll get "duplicate" error
  // In that case, re-fetch to get the newly created branch
  const branchName = `Branch ${new Date().toLocaleDateString(navigator.language === 'he' ? 'he-IL' : 'en-US')}`

  const { data: created, error: createError } = await supabase
    .from('knowledge_branches')
    .insert({
      project_id: projectId,
      user_id: user.id,
      name: branchName,
      status: 'active',
      is_current: true,
    })
    .select('id')
    .single()

  // If conflict (race condition), fetch the one that was created by competing client
  if (createError && createError.message.includes('duplicate')) {
    const { data: raced, error: refetchError } = await supabase
      .from('knowledge_branches')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('is_current', true)
      .eq('status', 'active')
      .maybeSingle()

    if (refetchError || !raced) {
      throw new Error('Failed to create or find active branch after race condition')
    }

    console.log('[Knowledge] Active branch already exists (race condition handled):', raced.id)
    return { id: raced.id }
  }

  if (createError) {
    throw new Error(`Failed to create active branch: ${createError.message}`)
  }

  if (!created) {
    throw new Error('Branch creation returned no data')
  }

  console.log('[Knowledge] New active branch created:', created.id)
  return { id: created.id }
}
