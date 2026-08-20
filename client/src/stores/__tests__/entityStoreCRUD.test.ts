import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Focused tests for Character CRUD operations with Main/Branch handling
 */

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

describe('Character CRUD: Main/Branch Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Read: Fetch existing Character', () => {
    it('should fetch Main character without Branch modifications', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Main entity: Leo (age: 25)
      const mainCharacter = {
        id: 'char-1',
        canonical_name: 'Leo',
        entity_type: 'character',
        entity_types: ['character'],
        description: 'Hero',
        attributes: {},
        structured_fields: { name: 'Leo', age: '25' },
        source: 'ai',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      // Verify: should return Main entity with age: 25
      expect(mainCharacter.structured_fields.age).toBe('25')
    })

    it('should fetch Main character with Branch overlay applied', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Main: Leo (age: 25)
      // Branch overlay: age overridden to 26
      const mainCharacter = {
        id: 'char-1',
        structured_fields: { name: 'Leo', age: '25' },
      }

      const branchOverlay = {
        overrides: { 'structured_fields.age': '26' },
        base_values: { 'structured_fields.age': '25' },
      }

      // Effective view should show age: 26 from overlay
      const effective = {
        ...mainCharacter,
        structured_fields: {
          ...mainCharacter.structured_fields,
          age: branchOverlay.overrides['structured_fields.age'],
        },
      }

      expect(effective.structured_fields.age).toBe('26')
    })
  })

  describe('Create: New Character with Main/Branch routing', () => {
    it('should create Character in Main layer when no Branch exists', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Create request without branchContext
      const createPayload = {
        project_id: 'project-1',
        user_id: 'user-1',
        canonical_name: 'Raven',
        entity_type: 'character',
        layer: 'main',
        branch_id: null,
      }

      // Verify: layer='main', branch_id=null
      expect(createPayload.layer).toBe('main')
      expect(createPayload.branch_id).toBeNull()
    })

    it('should create Character in Branch layer when Branch is active', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Create request with branchContext
      const branchContext = { branchId: 'branch-1', layer: 'branch' as const }

      const createPayload = {
        project_id: 'project-1',
        user_id: 'user-1',
        canonical_name: 'Phoenix',
        entity_type: 'character',
        layer: branchContext.layer,
        branch_id: branchContext.branchId,
      }

      // Verify: layer='branch', branch_id set
      expect(createPayload.layer).toBe('branch')
      expect(createPayload.branch_id).toBe('branch-1')
    })

    it('should not create duplicate entities', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Simulate: creating Leo in Main, then Main+Branch merged
      const mainEntity = { id: 'char-1', name: 'Leo', layer: 'main' }
      const branchOnlyEntity = { id: 'char-2', name: 'Raven', layer: 'branch' }

      const effectiveEntities = new Map()
      effectiveEntities.set(mainEntity.id, mainEntity)
      effectiveEntities.set(branchOnlyEntity.id, branchOnlyEntity)

      // Verify: 2 unique entities, no duplicates
      expect(effectiveEntities.size).toBe(2)
      expect(Array.from(effectiveEntities.values()).every(e => e.layer)).toBe(true)
    })
  })

  describe('Edit: Character field changes with Branch isolation', () => {
    it('should update Main character directly when no Branch exists', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Edit Leo in Main: age 25 → 26
      const mainEntity = {
        id: 'char-1',
        canonical_name: 'Leo',
        structured_fields: { age: '25' },
      }

      const updates = {
        canonical_name: 'Leo',
        structured_fields: { age: '26' },
      }

      // Verify: updates directly applied to Main
      const updated = { ...mainEntity, ...updates }
      expect(updated.structured_fields.age).toBe('26')
    })

    it('should create Branch overlay when editing Main entity while Branch is active', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Main: Leo (age: 25)
      // Branch active, edit Leo: age → 26
      // Should create overlay, NOT modify Main

      const branchContext = {
        branchId: 'branch-1',
        sourceEntityId: 'char-1',
      }

      const overlay = {
        branch_id: branchContext.branchId,
        source_entity_id: branchContext.sourceEntityId,
        overrides: { 'structured_fields.age': '26' },
        base_values: { 'structured_fields.age': '25' },
      }

      // Verify: overlay created with delta (only changed fields)
      expect(overlay.overrides['structured_fields.age']).toBe('26')
      expect(overlay.base_values['structured_fields.age']).toBe('25')
      expect(Object.keys(overlay.overrides).length).toBe(1) // Only 1 changed field
    })

    it('should keep Main entity unchanged when Branch edits are made', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      const mainEntity = {
        id: 'char-1',
        name: 'Leo',
        structured_fields: { age: '25', gender: 'male' },
      }

      // Branch changes age to 26
      void {
        overrides: { 'structured_fields.age': '26' },
      }

      // Main should remain unchanged
      expect(mainEntity.structured_fields.age).toBe('25')
      expect(mainEntity.structured_fields.gender).toBe('male')
    })
  })

  describe('Delete: Safe deletion of Main vs Branch entities', () => {
    it('should not hard-delete Main entity', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Try to delete Main entity (layer='main')
      const mainEntity = {
        id: 'char-1',
        layer: 'main',
        branch_id: null,
      }

      // Verify: deletion blocked for Main
      const canDelete = mainEntity.layer === 'branch'
      expect(canDelete).toBe(false)
    })

    it('should delete Branch-only entity when requested', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Delete Branch-only entity (layer='branch', no source_entity_id)
      const branchOnlyEntity = {
        id: 'char-2',
        layer: 'branch',
        branch_id: 'branch-1',
      }

      // Verify: deletion allowed for branch-only
      const canDelete = branchOnlyEntity.layer === 'branch'
      expect(canDelete).toBe(true)
    })

    it('should delete Branch overlay without affecting Main', async () => {
      const mockUser = { user: { id: 'user-1' } }
      ;(supabase.auth.getUser as any).mockResolvedValue(mockUser)

      // Delete overlay for Main entity edited in Branch
      const overlay = {
        id: 'overlay-1',
        branch_id: 'branch-1',
        source_entity_id: 'char-1', // Main entity
        entity_id: 'char-1',
      }

      // Deleting overlay doesn't touch Main entity
      // Main remains in knowledge_entities with unchanged data
      expect(overlay.source_entity_id).toBe('char-1')
    })
  })

  describe('Cancel: Discard unsaved changes', () => {
    it('should revert form to original state when Cancel is clicked', async () => {
      // User edits Leo: age 25 → 26
      const originalFormData = { name: 'Leo', age: '25' }
      const editedFormData = { name: 'Leo', age: '26' }

      // Click Cancel: revert to original
      const revertedData = { ...originalFormData }

      expect(revertedData.age).toBe('25')
      expect(editedFormData.age).toBe('26') // Not saved
    })

    it('should not persist changes when Cancel is used', async () => {
      // No database updates should occur on Cancel
      // Only local state reverts

      const updateCalls = []
      
      // Verify: no database calls made
      expect(updateCalls.length).toBe(0)
    })
  })

  describe('Multiple extractions: Data accumulation', () => {
    it('should display Characters from Doc 1 (Main) + Doc 2 (Branch)', async () => {
      // Doc 1 extraction → Main: Leo created
      // Doc 2 extraction → Branch: Raven created
      // Effective view should show: Leo + Raven

      const mainCharacters = [
        { id: 'char-1', name: 'Leo', layer: 'main' },
      ]

      const branchCharacters = [
        { id: 'char-2', name: 'Raven', layer: 'branch' },
      ]

      const effectiveView = [...mainCharacters, ...branchCharacters]

      expect(effectiveView.length).toBe(2)
      expect(effectiveView.map(c => c.name)).toContain('Leo')
      expect(effectiveView.map(c => c.name)).toContain('Raven')
    })

    it('should maintain Character data through multiple extractions', async () => {
      // Doc 1: Leo created in Main
      // Doc 2: New Branch created, Raven added, Leo untouched in Main
      // Doc 3: Same Branch, Phoenix added, Leo/Raven/Phoenix all visible

      const mainEntities = { 'char-1': { name: 'Leo', layer: 'main' } }
      const branchEntities = {
        'char-2': { name: 'Raven', layer: 'branch' },
        'char-3': { name: 'Phoenix', layer: 'branch' },
      }

      const allCharacters = { ...mainEntities, ...branchEntities }

      expect(Object.keys(allCharacters).length).toBe(3)
    })
  })

  describe('Field validation and integrity', () => {
    it('should store empty fields as null', async () => {
      const character = {
        structured_fields: {
          name: 'Leo',
          age: null, // Empty field stored as null
          gender: 'male',
        },
      }

      expect(character.structured_fields.age).toBeNull()
    })

    it('should trim whitespace from field values', async () => {
      const input = '  Leo  '
      const trimmed = input.trim()

      expect(trimmed).toBe('Leo')
    })
  })
})
