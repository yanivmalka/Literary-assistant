import { describe, it, expect } from 'vitest'

// ============================================
// Minimal Implementations for Testing
// ============================================

export function validateBranchContextSync(branchId: string | null | undefined): void {
  if (!branchId) {
    throw new Error(
      'Extraction rejected: No active branch. ' +
      'AI is not permitted to modify Main directly. ' +
      'Create or activate a Branch first.'
    )
  }
}

export function createBranchEntitySync(
  branchId: string | null | undefined,
  entityData: Record<string, unknown>
): Record<string, unknown> {
  validateBranchContextSync(branchId)

  return {
    layer: 'branch',
    branch_id: branchId,
    source: 'ai',
    ...entityData,
  }
}

export function createEntityOverlaySync(
  branchId: string | null | undefined,
  mainEntityId: string,
  overrides: Record<string, unknown>,
  baseValues: Record<string, unknown>
): Record<string, unknown> {
  validateBranchContextSync(branchId)

  return {
    branch_id: branchId,
    source_entity_id: mainEntityId,
    entity_id: mainEntityId,
    overrides,
    base_values: baseValues,
    is_modified: Object.keys(overrides).length > 0,
    modified_fields: Object.keys(overrides),
  }
}

// ============================================
// Test Suite: validateBranchContext
// ============================================

describe('validateBranchContext', () => {
  it('should throw error when branch_id is null', () => {
    expect(() => validateBranchContextSync(null)).toThrow(
      'Extraction rejected: No active branch'
    )
  })

  it('should throw error when branch_id is undefined', () => {
    expect(() => validateBranchContextSync(undefined)).toThrow(
      'Extraction rejected: No active branch'
    )
  })

  it('should not throw error when branch_id is valid', () => {
    expect(() => validateBranchContextSync('branch-123')).not.toThrow()
  })

  it('should emphasize AI cannot modify Main', () => {
    try {
      validateBranchContextSync(null)
    } catch (err: any) {
      expect(err.message).toContain('AI is not permitted to modify Main directly')
    }
  })
})

// ============================================
// Test Suite: createBranchEntity
// ============================================

describe('createBranchEntity', () => {
  it('should create entity with layer=branch and branch_id set', () => {
    const result = createBranchEntitySync('branch-1', {
      canonical_name: 'New Character',
      entity_type: 'character',
    })

    expect(result.layer).toBe('branch')
    expect(result.branch_id).toBe('branch-1')
    expect(result.source).toBe('ai')
  })

  it('should throw error when branch_id is null', () => {
    expect(() =>
      createBranchEntitySync(null, {
        canonical_name: 'New Character',
        entity_type: 'character',
      })
    ).toThrow('Extraction rejected: No active branch')
  })

  it('should preserve entity data', () => {
    const entityData = {
      canonical_name: 'Hero',
      entity_type: 'character',
      description: 'Main protagonist',
    }

    const result = createBranchEntitySync('branch-1', entityData)

    expect(result.canonical_name).toBe('Hero')
    expect(result.entity_type).toBe('character')
    expect(result.description).toBe('Main protagonist')
  })
})

// ============================================
// Test Suite: createEntityOverlay
// ============================================

describe('createEntityOverlay', () => {
  it('should create overlay with overrides and base_values', () => {
    const overrides = { canonical_name: 'Modified' }
    const baseValues = { canonical_name: 'Original' }

    const result = createEntityOverlaySync('branch-1', 'main-entity-1', overrides, baseValues)

    expect(result.source_entity_id).toBe('main-entity-1')
    expect(result.overrides).toEqual(overrides)
    expect(result.base_values).toEqual(baseValues)
  })

  it('should calculate modified_fields from overrides', () => {
    const overrides = {
      canonical_name: 'Modified',
      description: 'New desc',
    }

    const result = createEntityOverlaySync('branch-1', 'main-entity-1', overrides, {})

    expect(result.modified_fields).toEqual(['canonical_name', 'description'])
  })

  it('should set is_modified=true when overrides exist', () => {
    const result = createEntityOverlaySync('branch-1', 'main-entity-1', { field: 'value' }, {})

    expect(result.is_modified).toBe(true)
  })

  it('should set is_modified=false when no overrides', () => {
    const result = createEntityOverlaySync('branch-1', 'main-entity-1', {}, {})

    expect(result.is_modified).toBe(false)
  })

  it('should throw error when branch_id is null', () => {
    expect(() => createEntityOverlaySync(null, 'main-entity-1', {}, {})).toThrow(
      'Extraction rejected: No active branch'
    )
  })
})

// ============================================
// Integration Tests
// ============================================

describe('AI Extraction Branch Routing - Core Logic', () => {
  it('should prevent AI from modifying Main - no branch context', () => {
    // Attempt to create entity without branch
    expect(() =>
      createBranchEntitySync(null, {
        canonical_name: 'New Entity',
        entity_type: 'character',
      })
    ).toThrow('No active branch')

    // Attempt to create overlay without branch
    expect(() => createEntityOverlaySync(null, 'main-1', {}, {})).toThrow('No active branch')
  })

  it('should always include branch_id in creation', () => {
    const result1 = createBranchEntitySync('branch-1', {
      canonical_name: 'Character A',
      entity_type: 'character',
    })

    const result2 = createBranchEntitySync('branch-2', {
      canonical_name: 'Character A',
      entity_type: 'character',
    })

    expect(result1.branch_id).toBe('branch-1')
    expect(result2.branch_id).toBe('branch-2')
    expect(result1.branch_id).not.toBe(result2.branch_id)
  })

  it('should track modifications in overlay', () => {
    const overlay1 = createEntityOverlaySync(
      'branch-1',
      'main-1',
      { name: 'Modified' },
      { name: 'Original' }
    )

    const overlay2 = createEntityOverlaySync('branch-1', 'main-1', {}, {})

    expect(overlay1.is_modified).toBe(true)
    expect(overlay2.is_modified).toBe(false)
    expect((overlay1.modified_fields as string[]).includes('name')).toBe(true)
    expect((overlay2.modified_fields as string[]).length).toBe(0)
  })

  it('should enforce branch isolation in entity creation', () => {
    // Branch 1 creates entity
    const entity1 = createBranchEntitySync('branch-1', {
      canonical_name: 'Same Name',
      entity_type: 'character',
    })

    // Branch 2 creates entity with same name
    const entity2 = createBranchEntitySync('branch-2', {
      canonical_name: 'Same Name',
      entity_type: 'character',
    })

    // Both should have their own branch_id
    expect(entity1.branch_id).toBe('branch-1')
    expect(entity2.branch_id).toBe('branch-2')
    expect(entity1.branch_id).not.toEqual(entity2.branch_id)
  })

  it('should maintain base_values for conflict detection', () => {
    const baseValues = {
      age: '25',
      name: 'Original Name',
    }

    const overlay = createEntityOverlaySync('branch-1', 'main-1', { age: '30' }, baseValues)

    // Base values preserved
    expect(overlay.base_values).toEqual(baseValues)
    // Only changed field in overrides
    expect(overlay.overrides).toEqual({ age: '30' })
    // Name not in overrides (unchanged)
    expect((overlay.overrides as any).name).toBeUndefined()
  })

  it('should require branch context for all extraction operations', () => {
    // Validation must happen before ANY operation
    const operations = [
      () => createBranchEntitySync(null, { canonical_name: 'Test', entity_type: 'char' }),
      () => createEntityOverlaySync(null, 'entity', {}, {}),
    ]

    operations.forEach((op) => {
      expect(op).toThrow('Extraction rejected: No active branch')
    })
  })

  it('should mark AI-sourced entities correctly', () => {
    const entity = createBranchEntitySync('branch-1', {
      canonical_name: 'AI Found',
      entity_type: 'character',
    })

    expect(entity.source).toBe('ai')
    expect(entity.layer).toBe('branch')
  })
})
