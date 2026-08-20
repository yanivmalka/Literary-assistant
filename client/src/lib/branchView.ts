/**
 * Branch View Functions
 * 
 * Implements the Overlay model for displaying entities:
 * - Main Entity + Branch Overrides = Effective Branch View
 * 
 * For each entity in a branch:
 * 1. Load the Main Entity (from Main layer)
 * 2. Find the Overlay record (knowledge_branch_entities) if exists
 * 3. Merge: use overrides where present, Main values for rest
 * 4. Tag fields with their source (Main or Branch)
 */

/**
 * Effective Entity: Main Entity + Branch Overrides merged
 * Includes source information for each field (Main or Branch)
 */
export interface EffectiveEntity {
  id: string
  branch_id: string
  canonical_name: string
  entity_type: string
  description: string | null
  attributes: Record<string, unknown>
  structured_fields: Record<string, unknown>
  review_status: string
  
  // Source info: which fields came from Main vs Branch
  _sources: {
    canonical_name: 'main' | 'branch'
    entity_type: 'main' | 'branch'
    description: 'main' | 'branch'
    [key: string]: 'main' | 'branch' // e.g., "attributes.age", "structured_fields.height"
  }
  
  // Metadata
  is_branch_only: boolean
  has_overrides: boolean
  modified_fields: string[]
  created_at: string
  updated_at: string
}

/**
 * Main Entity shape (from knowledge_entities layer=main)
 */
export interface MainEntityRecord {
  id: string
  project_id: string
  user_id: string
  canonical_name: string
  entity_type: string
  description: string | null
  attributes: Record<string, unknown>
  structured_fields: Record<string, unknown>
  review_status?: string
  created_at: string
  updated_at: string
}

/**
 * Branch Entity shape (from knowledge_branch_entities)
 */
export interface BranchEntityOverlay {
  id: string
  branch_id: string
  source_entity_id: string | null // NULL if branch-only
  entity_id: string | null
  overrides: Record<string, unknown> // Only changed fields (delta)
  base_values: Record<string, unknown> // Snapshot of Main at override creation
  rejected_fields: string[]
  is_modified: boolean
  modified_fields: string[]
  created_at: string
  updated_at: string
}

/**
 * Merge Main Entity + Branch Overlay into Effective View
 * 
 * @param main - Main layer entity
 * @param overlay - Branch overlay record (if exists)
 * @param branchId - Current branch ID
 * @returns Effective view with source tracking
 */
export function getEffectiveBranchView(
  main: MainEntityRecord,
  overlay: BranchEntityOverlay | null,
  branchId: string
): EffectiveEntity {
  // Start with main entity
  const effective: EffectiveEntity = {
    id: overlay?.entity_id || main.id,
    branch_id: branchId,
    canonical_name: main.canonical_name,
    entity_type: main.entity_type,
    description: main.description,
    attributes: { ...(main.attributes || {}) },
    structured_fields: { ...(main.structured_fields || {}) },
    review_status: main.review_status || 'pending',
    _sources: {
      canonical_name: 'main',
      entity_type: 'main',
      description: 'main',
    },
    is_branch_only: false,
    has_overrides: false,
    modified_fields: [],
    created_at: main.created_at,
    updated_at: main.updated_at,
  }

  // If no overlay, return main as-is
  if (!overlay) {
    return effective
  }

  // Apply overrides
  if (overlay.overrides && Object.keys(overlay.overrides).length > 0) {
    effective.has_overrides = true

    for (const [key, value] of Object.entries(overlay.overrides)) {
      // Handle top-level fields
      if (key === 'canonical_name') {
        effective.canonical_name = value as string
        effective._sources.canonical_name = 'branch'
      } else if (key === 'entity_type') {
        effective.entity_type = value as string
        effective._sources.entity_type = 'branch'
      } else if (key === 'description') {
        effective.description = value as string | null
        effective._sources.description = 'branch'
      }
      // Handle nested fields (e.g., "attributes.age", "structured_fields.height")
      else if (key.startsWith('attributes.')) {
        const fieldName = key.replace('attributes.', '')
        effective.attributes[fieldName] = value
        effective._sources[key] = 'branch'
      } else if (key.startsWith('structured_fields.')) {
        const fieldName = key.replace('structured_fields.', '')
        effective.structured_fields[fieldName] = value
        effective._sources[key] = 'branch'
      }
    }
  }

  // Set metadata
  effective.is_branch_only = overlay.source_entity_id === null
  effective.modified_fields = overlay.modified_fields || []
  effective.updated_at = overlay.updated_at

  return effective
}

/**
 * Get Effective view for a Branch-only Entity
 * (no Main entity, only branch-only entity in knowledge_entities)
 */
export function getEffectiveBranchOnlyView(
  branchEntity: MainEntityRecord,
  branchId: string
): EffectiveEntity {
  return {
    id: branchEntity.id,
    branch_id: branchId,
    canonical_name: branchEntity.canonical_name,
    entity_type: branchEntity.entity_type,
    description: branchEntity.description,
    attributes: { ...(branchEntity.attributes || {}) },
    structured_fields: { ...(branchEntity.structured_fields || {}) },
    review_status: branchEntity.review_status || 'pending',
    _sources: {
      canonical_name: 'branch',
      entity_type: 'branch',
      description: 'branch',
    },
    is_branch_only: true,
    has_overrides: false,
    modified_fields: [],
    created_at: branchEntity.created_at,
    updated_at: branchEntity.updated_at,
  }
}

/**
 * Calculate which fields have been overridden
 * Returns object with field name as key and whether it's overridden (true/false)
 */
export function getFieldOverrideStatus(
  overlay: BranchEntityOverlay | null
): Record<string, boolean> {
  const status: Record<string, boolean> = {}

  if (!overlay?.overrides) {
    return status
  }

  for (const [key] of Object.entries(overlay.overrides)) {
    status[key] = true
  }

  return status
}

/**
 * Create or update an override for a specific field
 * 
 * @param main - Main entity data
 * @param fieldPath - Path to field (e.g., "canonical_name", "attributes.age")
 * @param newValue - New value for the field
 * @param currentOverlay - Existing overlay (if any)
 * @returns Updated overrides object
 */
export function applyFieldOverride(
  main: MainEntityRecord,
  fieldPath: string,
  newValue: unknown,
  currentOverlay: BranchEntityOverlay | null
): Record<string, unknown> {
  const overrides = { ...(currentOverlay?.overrides || {}) }
  const baseValues = { ...(currentOverlay?.base_values || {}) }

  // If no existing base_values, capture current Main state
  if (!currentOverlay?.base_values || Object.keys(baseValues).length === 0) {
    if (fieldPath === 'canonical_name') {
      baseValues.canonical_name = main.canonical_name
    } else if (fieldPath === 'entity_type') {
      baseValues.entity_type = main.entity_type
    } else if (fieldPath === 'description') {
      baseValues.description = main.description
    } else if (fieldPath.startsWith('attributes.')) {
      const attrKey = fieldPath.replace('attributes.', '')
      baseValues[fieldPath] = main.attributes?.[attrKey] ?? null
    } else if (fieldPath.startsWith('structured_fields.')) {
      const fieldKey = fieldPath.replace('structured_fields.', '')
      baseValues[fieldPath] = main.structured_fields?.[fieldKey] ?? null
    }
  }

  // Set the override
  overrides[fieldPath] = newValue

  // If new value equals base value, remove the override
  if (JSON.stringify(overrides[fieldPath]) === JSON.stringify(baseValues[fieldPath])) {
    delete overrides[fieldPath]
  }

  return overrides
}

/**
 * Remove an override (revert to Main value)
 */
export function removeFieldOverride(
  fieldPath: string,
  currentOverlay: BranchEntityOverlay | null
): Record<string, unknown> {
  const overrides = { ...(currentOverlay?.overrides || {}) }
  delete overrides[fieldPath]
  return overrides
}

/**
 * Detect conflicts: if Main changed since override was created
 * Returns conflicted field paths
 */
export function detectConflicts(
  main: MainEntityRecord,
  overlay: BranchEntityOverlay | null
): string[] {
  if (!overlay?.base_values || !overlay?.overrides) {
    return []
  }

  const conflicts: string[] = []

  for (const fieldPath of Object.keys(overlay.overrides)) {
    const baseValue = overlay.base_values[fieldPath]
    let currentMainValue: unknown = null

    if (fieldPath === 'canonical_name') {
      currentMainValue = main.canonical_name
    } else if (fieldPath === 'entity_type') {
      currentMainValue = main.entity_type
    } else if (fieldPath === 'description') {
      currentMainValue = main.description
    } else if (fieldPath.startsWith('attributes.')) {
      const attrKey = fieldPath.replace('attributes.', '')
      currentMainValue = main.attributes?.[attrKey] ?? null
    } else if (fieldPath.startsWith('structured_fields.')) {
      const fieldKey = fieldPath.replace('structured_fields.', '')
      currentMainValue = main.structured_fields?.[fieldKey] ?? null
    }

    // If Main changed since overlay was created, it's a conflict
    if (JSON.stringify(baseValue) !== JSON.stringify(currentMainValue)) {
      conflicts.push(fieldPath)
    }
  }

  return conflicts
}

/**
 * Get list of fields that differ between effective and main
 */
export function getDifferingFields(
  main: MainEntityRecord,
  effective: EffectiveEntity
): string[] {
  const differing: string[] = []

  // Compare top-level fields
  if (effective.canonical_name !== main.canonical_name) {
    differing.push('canonical_name')
  }
  if (effective.entity_type !== main.entity_type) {
    differing.push('entity_type')
  }
  if (effective.description !== main.description) {
    differing.push('description')
  }

  // Compare attributes
  const mainAttrs = main.attributes || {}
  const effectiveAttrs = effective.attributes || {}
  const allAttrKeys = new Set([...Object.keys(mainAttrs), ...Object.keys(effectiveAttrs)])
  for (const key of allAttrKeys) {
    const attrPath = `attributes.${key}`
    if (JSON.stringify(mainAttrs[key]) !== JSON.stringify(effectiveAttrs[key])) {
      differing.push(attrPath)
    }
  }

  // Compare structured_fields
  const mainStructured = main.structured_fields || {}
  const effectiveStructured = effective.structured_fields || {}
  const allStructuredKeys = new Set([...Object.keys(mainStructured), ...Object.keys(effectiveStructured)])
  for (const key of allStructuredKeys) {
    const fieldPath = `structured_fields.${key}`
    if (JSON.stringify(mainStructured[key]) !== JSON.stringify(effectiveStructured[key])) {
      differing.push(fieldPath)
    }
  }

  return differing
}
