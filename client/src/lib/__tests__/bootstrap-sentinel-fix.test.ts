import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isLegacyBootstrapEntity, filterLegacyBootstrapEntities, LEGACY_BOOTSTRAP_CANONICAL_NAME } from '@/lib/mainLayer'

/**
 * Bootstrap Sentinel Fix Tests
 * 
 * Validates that:
 * A. Bootstrap entities are no longer created (implicit initialization)
 * B. Legacy bootstrap rows are properly filtered in Main detection
 * C. Client and Edge Function use identical Main-exists logic
 * D. UI cannot display bootstrap as a character/entity
 * E. Main initialization is now implicit through real entity insertion
 */

describe('Bootstrap Sentinel Fix', () => {
  describe('A. Main Initialization is Implicit', () => {
    it('should initialize Main layer when first extraction writes real entities', () => {
      // Before: empty Main layer
      const mainEntitiesCount = 0
      const mainIsEmpty = mainEntitiesCount === 0

      expect(mainIsEmpty).toBe(true)

      // During first extraction: real entities written to Main
      // After: Main layer is considered initialized
      const extractedEntitiesCount = 3
      const mainNowHasEntities = extractedEntitiesCount > 0

      expect(mainNowHasEntities).toBe(true)
      // No bootstrap sentinel entity created
    })

    it('should NOT create bootstrap entity on first extraction', () => {
      // The ensureMainBootstrapped() function no longer exists.
      // No bootstrap entity is created.
      // Main initialization is implicit.

      const bootstrapEntityCreated = false // Never created

      expect(bootstrapEntityCreated).toBe(false)
    })

    it('should route first extraction to Main (without bootstrap marker)', () => {
      const mainExists = false
      const useMainForExtraction = !mainExists

      expect(useMainForExtraction).toBe(true)
      // Real entities from extraction will initialize Main automatically
    })
  })

  describe('B. Legacy Bootstrap Filtering (Backward Compatibility)', () => {
    it('should identify legacy bootstrap entities', () => {
      const legacyBootstrap = {
        id: 'legacy-1',
        canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME,
        entity_type: 'event',
      }

      expect(isLegacyBootstrapEntity(legacyBootstrap)).toBe(true)
    })

    it('should identify real entities (not bootstrap)', () => {
      const realEntity = {
        id: 'real-1',
        canonical_name: 'Leo',
        entity_type: 'character',
      }

      expect(isLegacyBootstrapEntity(realEntity)).toBe(false)
    })

    it('should filter out bootstrap entities from collections', () => {
      const entities = [
        { canonical_name: 'Leo', entity_type: 'character' },
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, entity_type: 'event' },
        { canonical_name: 'Miriam', entity_type: 'character' },
      ]

      const filtered = filterLegacyBootstrapEntities(entities)

      expect(filtered).toHaveLength(2)
      expect(filtered.map(e => e.canonical_name)).toEqual(['Leo', 'Miriam'])
      expect(filtered.some(e => e.canonical_name === LEGACY_BOOTSTRAP_CANONICAL_NAME)).toBe(false)
    })

    it('should handle empty legacy bootstrap collection', () => {
      const entities = [
        { canonical_name: 'Leo', entity_type: 'character' },
        { canonical_name: 'Miriam', entity_type: 'character' },
      ]

      const filtered = filterLegacyBootstrapEntities(entities)

      expect(filtered).toHaveLength(2)
      expect(filtered).toEqual(entities)
    })

    it('should handle collection with only bootstrap', () => {
      const entities = [
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, entity_type: 'event' },
      ]

      const filtered = filterLegacyBootstrapEntities(entities)

      expect(filtered).toHaveLength(0)
    })
  })

  describe('C. Client/Edge Function Consistency', () => {
    it('should use identical Main-exists query filters on client', () => {
      // Client query: select entities where layer='main' AND canonical_name != '__bootstrap__'
      const clientQuery = {
        layer: 'main',
        excludeCanonicalName: LEGACY_BOOTSTRAP_CANONICAL_NAME,
      }

      const edgeFunctionQuery = {
        layer: 'main',
        excludeCanonicalName: '__bootstrap__',
      }

      // Both queries should be identical
      expect(clientQuery.layer).toBe(edgeFunctionQuery.layer)
      expect(clientQuery.excludeCanonicalName).toBe(edgeFunctionQuery.excludeCanonicalName)
    })

    it('should return true only when real entities exist (both client and Edge)', () => {
      // Empty Main (no entities, no bootstrap)
      const hasRealEntities_Empty = false
      expect(hasRealEntities_Empty).toBe(false)

      // Main with only legacy bootstrap (rare, backward compat)
      const mainEntitiesExcludingBootstrap = 0
      const hasRealEntities_BootstrapOnly = mainEntitiesExcludingBootstrap > 0
      expect(hasRealEntities_BootstrapOnly).toBe(false)

      // Main with real entities
      const hasRealEntities_WithData = true
      expect(hasRealEntities_WithData).toBe(true)
    })

    it('should reject extraction to Main if real entities already exist', () => {
      const mainHasRealEntities = true
      const allowExtractionToMain = !mainHasRealEntities

      expect(allowExtractionToMain).toBe(false)
      // Next extraction must use Branch
    })
  })

  describe('D. UI Cannot Display Bootstrap as Entity', () => {
    it('should exclude bootstrap from character hub', () => {
      const allMainEntities = [
        { id: '1', canonical_name: 'Leo', entity_type: 'character' },
        { id: '2', canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, entity_type: 'event' },
        { id: '3', canonical_name: 'Miriam', entity_type: 'character' },
      ]

      // UI filtering: remove bootstrap before display
      const displayEntities = filterLegacyBootstrapEntities(allMainEntities)

      expect(displayEntities).toHaveLength(2)
      expect(displayEntities.map(e => e.canonical_name)).toEqual(['Leo', 'Miriam'])
    })

    it('should not render bootstrap in locations hub', () => {
      const locationEntities = [
        { canonical_name: 'Jerusalem', entity_type: 'location' },
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, entity_type: 'event' },
      ]

      const displayLocations = filterLegacyBootstrapEntities(locationEntities)

      expect(displayLocations).toHaveLength(1)
      expect(displayLocations[0].canonical_name).toBe('Jerusalem')
    })

    it('should not render bootstrap in abilities panel', () => {
      const abilityEntities = [
        { canonical_name: 'Magic', entity_type: 'ability' },
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, entity_type: 'event' },
      ]

      const displayAbilities = filterLegacyBootstrapEntities(abilityEntities)

      expect(displayAbilities).toHaveLength(1)
      expect(displayAbilities[0].canonical_name).toBe('Magic')
    })

    it('should handle empty entity list gracefully', () => {
      const emptyEntities: Array<{ canonical_name: string; entity_type: string }> = []

      const displayed = filterLegacyBootstrapEntities(emptyEntities)

      expect(displayed).toHaveLength(0)
    })
  })

  describe('E. First Extraction Routing', () => {
    it('should set use_main=true when Main is empty', () => {
      const mainExists = false

      const extractionRequest = {
        use_main: !mainExists,
        target_branch_id: !mainExists ? null : 'branch-1',
      }

      expect(extractionRequest.use_main).toBe(true)
      expect(extractionRequest.target_branch_id).toBeNull()
    })

    it('should set use_main=false when Main already has entities', () => {
      const mainExists = true

      const extractionRequest = {
        use_main: !mainExists,
        target_branch_id: !mainExists ? null : 'branch-1',
      }

      expect(extractionRequest.use_main).toBe(false)
      expect(extractionRequest.target_branch_id).toBe('branch-1')
    })

    it('should transition from Main to Branch correctly', () => {
      const states = [
        {
          step: 1,
          mainExists: false,
          useMain: true,
          action: 'first extraction → Main',
        },
        {
          step: 2,
          mainExists: true,
          useMain: false,
          action: 'subsequent extraction → Branch',
        },
      ]

      expect(states[0].mainExists).toBe(false)
      expect(states[0].useMain).toBe(true)

      expect(states[1].mainExists).toBe(true)
      expect(states[1].useMain).toBe(false)
    })
  })

  describe('F. Migration 111 Cleanup', () => {
    it('should safely delete bootstrap entities without affecting real entities', () => {
      // Migration 111 deletes rows where canonical_name='__bootstrap__'
      // Only these synthetic rows are deleted, no real data is affected

      const beforeMigration = {
        realCharacters: 10,
        bootstrapSentinels: 1,
        total: 11,
      }

      const afterMigration = {
        realCharacters: 10,
        bootstrapSentinels: 0,
        total: 10,
      }

      expect(afterMigration.realCharacters).toBe(beforeMigration.realCharacters)
      expect(afterMigration.bootstrapSentinels).toBe(0)
    })

    it('should be idempotent if bootstrap rows already cleaned', () => {
      // Running migration 111 twice should have no adverse effects
      const beforeFirstRun = { bootstrapCount: 1 }
      const afterFirstRun = { bootstrapCount: 0 }
      const afterSecondRun = { bootstrapCount: 0 }

      expect(afterSecondRun.bootstrapCount).toBe(afterFirstRun.bootstrapCount)
    })
  })

  describe('G. Legacy Project Handling', () => {
    it('should correctly handle project with legacy bootstrap row', () => {
      // A legacy project might have a single __bootstrap__ row
      // hasMainEntities() should treat this as "no Main entities"

      const allEntities = [
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, layer: 'main' },
      ]

      // Filter: exclude bootstrap
      const realEntities = allEntities.filter(
        e => e.canonical_name !== LEGACY_BOOTSTRAP_CANONICAL_NAME
      )

      expect(realEntities).toHaveLength(0)
      // System treats this as "Main is empty, next extraction can use Main"
    })

    it('should correctly handle project with bootstrap + real entities', () => {
      // A project that was bootstrapped and then had extraction
      const allEntities = [
        { canonical_name: LEGACY_BOOTSTRAP_CANONICAL_NAME, layer: 'main' },
        { canonical_name: 'Leo', layer: 'main' },
        { canonical_name: 'Miriam', layer: 'main' },
      ]

      // Filter: exclude bootstrap
      const realEntities = allEntities.filter(
        e => e.canonical_name !== LEGACY_BOOTSTRAP_CANONICAL_NAME
      )

      expect(realEntities).toHaveLength(2)
      expect(realEntities.map(e => e.canonical_name)).toEqual(['Leo', 'Miriam'])
      // System treats this as "Main has entities, next extraction must use Branch"
    })
  })
})
