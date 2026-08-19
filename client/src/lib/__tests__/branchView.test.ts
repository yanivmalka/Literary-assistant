import { describe, it, expect } from 'vitest'
import {
  getEffectiveBranchView,
  getEffectiveBranchOnlyView,
  applyFieldOverride,
  removeFieldOverride,
  detectConflicts,
  getDifferingFields,
  type MainEntityRecord,
  type BranchEntityOverlay,
} from '../branchView'

// ============================================
// Test Data
// ============================================

const createMainEntity = (overrides?: Partial<MainEntityRecord>): MainEntityRecord => ({
  id: 'main-1',
  project_id: 'project-1',
  user_id: 'user-1',
  canonical_name: 'Hero',
  entity_type: 'character',
  description: 'The main character',
  attributes: {
    age: '25',
    height: '180',
  },
  structured_fields: {
    age: '25',
    hair_color: 'brown',
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

const createOverlay = (overrides?: Partial<BranchEntityOverlay>): BranchEntityOverlay => ({
  id: 'overlay-1',
  branch_id: 'branch-1',
  source_entity_id: 'main-1',
  entity_id: 'main-1',
  overrides: {},
  base_values: {},
  rejected_fields: [],
  is_modified: false,
  modified_fields: [],
  created_at: '2024-01-02T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  ...overrides,
})

// ============================================
// Test Suite: getEffectiveBranchView
// ============================================

describe('getEffectiveBranchView', () => {
  it('should return main entity unchanged when no overlay exists', () => {
    const main = createMainEntity()
    const effective = getEffectiveBranchView(main, null, 'branch-1')

    expect(effective.canonical_name).toBe('Hero')
    expect(effective.entity_type).toBe('character')
    expect(effective.description).toBe('The main character')
    expect(effective.has_overrides).toBe(false)
    expect(effective.is_branch_only).toBe(false)
  })

  it('should apply single field override', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Hero Modified',
      },
      base_values: {
        canonical_name: 'Hero',
      },
    })

    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    expect(effective.canonical_name).toBe('Hero Modified')
    expect(effective.entity_type).toBe('character')
    expect(effective._sources.canonical_name).toBe('branch')
    expect(effective._sources.entity_type).toBe('main')
    expect(effective.has_overrides).toBe(true)
  })

  it('should apply multiple field overrides', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Hero Modified',
        description: 'Modified description',
        'attributes.age': '30',
      },
      base_values: {
        canonical_name: 'Hero',
        description: 'The main character',
        'attributes.age': '25',
      },
      modified_fields: ['canonical_name', 'description', 'attributes.age'],
      is_modified: true,
    })

    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    expect(effective.canonical_name).toBe('Hero Modified')
    expect(effective.description).toBe('Modified description')
    expect(effective.attributes.age).toBe('30')
    expect(effective.modified_fields).toContain('canonical_name')
    expect(effective.modified_fields).toContain('attributes.age')
  })

  it('should preserve main values for fields without override', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Hero Modified',
      },
      base_values: {
        canonical_name: 'Hero',
      },
    })

    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    // Overridden
    expect(effective.canonical_name).toBe('Hero Modified')
    expect(effective._sources.canonical_name).toBe('branch')

    // Not overridden - should be from Main
    expect(effective.entity_type).toBe('character')
    expect(effective._sources.entity_type).toBe('main')
    expect(effective.description).toBe('The main character')
    expect(effective._sources.description).toBe('main')
  })

  it('should handle branch-only entities (source_entity_id = NULL)', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      source_entity_id: null,
      entity_id: 'branch-entity-1',
    })

    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    expect(effective.is_branch_only).toBe(true)
  })

  it('should mark fields with their source (main or branch)', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
        'structured_fields.hair_color': 'red',
      },
      base_values: {
        canonical_name: 'Hero',
        'structured_fields.hair_color': 'brown',
      },
    })

    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    expect(effective._sources.canonical_name).toBe('branch')
    expect(effective._sources.entity_type).toBe('main')
    expect(effective._sources['structured_fields.hair_color']).toBe('branch')
  })
})

// ============================================
// Test Suite: applyFieldOverride
// ============================================

describe('applyFieldOverride', () => {
  it('should create new override for a field', () => {
    const main = createMainEntity()
    const overrides = applyFieldOverride(main, 'canonical_name', 'Hero Modified', null)

    expect(overrides.canonical_name).toBe('Hero Modified')
  })

  it('should update existing override', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Hero Modified',
      },
      base_values: {
        canonical_name: 'Hero',
      },
    })

    const overrides = applyFieldOverride(main, 'canonical_name', 'Hero Modified Again', overlay)

    expect(overrides.canonical_name).toBe('Hero Modified Again')
  })

  it('should remove override if value equals base value', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Hero Modified',
      },
      base_values: {
        canonical_name: 'Hero',
      },
    })

    // Revert to base value
    const overrides = applyFieldOverride(main, 'canonical_name', 'Hero', overlay)

    expect(overrides.canonical_name).toBeUndefined()
  })

  it('should handle nested field overrides (attributes.age)', () => {
    const main = createMainEntity()
    const overrides = applyFieldOverride(main, 'attributes.age', '30', null)

    expect(overrides['attributes.age']).toBe('30')
  })

  it('should handle structured_fields overrides', () => {
    const main = createMainEntity()
    const overrides = applyFieldOverride(main, 'structured_fields.hair_color', 'red', null)

    expect(overrides['structured_fields.hair_color']).toBe('red')
  })
})

// ============================================
// Test Suite: removeFieldOverride
// ============================================

describe('removeFieldOverride', () => {
  it('should remove override and revert to main', () => {
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
      },
    })

    const overrides = removeFieldOverride('canonical_name', overlay)

    expect(overrides.canonical_name).toBeUndefined()
  })

  it('should preserve other overrides when removing one', () => {
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
        description: 'Modified desc',
      },
    })

    const overrides = removeFieldOverride('canonical_name', overlay)

    expect(overrides.canonical_name).toBeUndefined()
    expect(overrides.description).toBe('Modified desc')
  })
})

// ============================================
// Test Suite: detectConflicts
// ============================================

describe('detectConflicts', () => {
  it('should detect no conflicts when main unchanged since overlay creation', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
      },
      base_values: {
        canonical_name: 'Hero', // Same as current main
      },
    })

    const conflicts = detectConflicts(main, overlay)

    expect(conflicts).toHaveLength(0)
  })

  it('should detect conflict when main changed after overlay creation', () => {
    const main = createMainEntity({
      canonical_name: 'Hero Updated', // Main changed
    })
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
      },
      base_values: {
        canonical_name: 'Hero', // What it was when overlay was created
      },
    })

    const conflicts = detectConflicts(main, overlay)

    expect(conflicts).toContain('canonical_name')
  })

  it('should detect conflicts in nested fields', () => {
    const main = createMainEntity({
      attributes: {
        age: '35', // Changed from 25
        height: '180',
      },
    })
    const overlay = createOverlay({
      overrides: {
        'attributes.age': '30',
      },
      base_values: {
        'attributes.age': '25', // Original value
      },
    })

    const conflicts = detectConflicts(main, overlay)

    expect(conflicts).toContain('attributes.age')
  })

  it('should return empty conflicts when no overlay', () => {
    const main = createMainEntity()

    const conflicts = detectConflicts(main, null)

    expect(conflicts).toHaveLength(0)
  })
})

// ============================================
// Test Suite: getDifferingFields
// ============================================

describe('getDifferingFields', () => {
  it('should return empty when effective equals main', () => {
    const main = createMainEntity()
    const effective = getEffectiveBranchView(main, null, 'branch-1')

    const differing = getDifferingFields(main, effective)

    expect(differing).toHaveLength(0)
  })

  it('should identify top-level field differences', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        canonical_name: 'Modified',
        description: 'Modified desc',
      },
    })
    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    const differing = getDifferingFields(main, effective)

    expect(differing).toContain('canonical_name')
    expect(differing).toContain('description')
    expect(differing).not.toContain('entity_type')
  })

  it('should identify nested field differences (attributes)', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        'attributes.age': '30',
      },
    })
    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    const differing = getDifferingFields(main, effective)

    expect(differing).toContain('attributes.age')
  })

  it('should identify structured_fields differences', () => {
    const main = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        'structured_fields.hair_color': 'red',
      },
    })
    const effective = getEffectiveBranchView(main, overlay, 'branch-1')

    const differing = getDifferingFields(main, effective)

    expect(differing).toContain('structured_fields.hair_color')
  })
})

// ============================================
// Test Suite: getEffectiveBranchOnlyView
// ============================================

describe('getEffectiveBranchOnlyView', () => {
  it('should create effective view for branch-only entity', () => {
    const branchEntity = createMainEntity({
      id: 'branch-entity-1',
      canonical_name: 'New Character',
    })

    const effective = getEffectiveBranchOnlyView(branchEntity, 'branch-1')

    expect(effective.id).toBe('branch-entity-1')
    expect(effective.canonical_name).toBe('New Character')
    expect(effective.is_branch_only).toBe(true)
    expect(effective.has_overrides).toBe(false)
    expect(effective._sources.canonical_name).toBe('branch')
  })
})

// ============================================
// Integration Tests
// ============================================

describe('Branch View Integration', () => {
  it('should handle scenario: entity without overlay equals main', () => {
    const main = createMainEntity()
    const effective = getEffectiveBranchView(main, null, 'branch-1')

    expect(JSON.stringify(effective)).toContain(main.canonical_name)
    expect(effective.has_overrides).toBe(false)
  })

  it('should handle scenario: main changes after overlay creation', () => {
    const mainAtOverlayTime = createMainEntity()
    const overlay = createOverlay({
      overrides: {
        'attributes.age': '30',
      },
      base_values: {
        'attributes.age': '25',
      },
    })

    // User creates overlay with age='30'
    const effective1 = getEffectiveBranchView(mainAtOverlayTime, overlay, 'branch-1')
    expect(effective1.attributes.age).toBe('30')

    // Later, main is updated to age='35'
    const mainAfterUpdate = createMainEntity({
      attributes: {
        age: '35',
        height: '180',
      },
    })

    const effective2 = getEffectiveBranchView(mainAfterUpdate, overlay, 'branch-1')
    
    // Effective should still show '30' (override), not '35' (new main)
    expect(effective2.attributes.age).toBe('30')

    // But conflict should be detected
    const conflicts = detectConflicts(mainAfterUpdate, overlay)
    expect(conflicts).toContain('attributes.age')
  })

  it('should handle scenario: multiple branches do not interfere', () => {
    const main = createMainEntity()

    const overlay1 = createOverlay({
      branch_id: 'branch-1',
      overrides: {
        canonical_name: 'Branch1 Name',
      },
    })

    const overlay2 = createOverlay({
      branch_id: 'branch-2',
      overrides: {
        canonical_name: 'Branch2 Name',
      },
    })

    const effective1 = getEffectiveBranchView(main, overlay1, 'branch-1')
    const effective2 = getEffectiveBranchView(main, overlay2, 'branch-2')

    expect(effective1.canonical_name).toBe('Branch1 Name')
    expect(effective2.canonical_name).toBe('Branch2 Name')
  })
})
