import { describe, it, expect } from 'vitest'
import {
  ENTITY_TYPES,
  EntityType,
  CHARACTER_FIELD_GROUPS,
  LOCATION_FIELD_GROUPS,
  OBJECT_FIELD_GROUPS,
  ABILITY_FIELD_GROUPS,
  EVENT_FIELD_GROUPS,
  getFieldGroupsForType,
  getFieldsForType,
  createEmptyFields,
  ENTITY_TYPE_META,
  TEXTAREA_FIELDS,
} from '../entityTypes'

describe('Entity Types', () => {
  // ============================================
  // 1. All 6 entity types exist
  // ============================================

  describe('ENTITY_TYPES constant', () => {
    it('should contain exactly 6 entity types', () => {
      expect(ENTITY_TYPES).toHaveLength(6)
    })

    it('should contain character type', () => {
      expect(ENTITY_TYPES).toContain('character')
    })

    it('should contain location type', () => {
      expect(ENTITY_TYPES).toContain('location')
    })

    it('should contain object type', () => {
      expect(ENTITY_TYPES).toContain('object')
    })

    it('should contain ability type', () => {
      expect(ENTITY_TYPES).toContain('ability')
    })

    it('should contain magic_ability type', () => {
      expect(ENTITY_TYPES).toContain('magic_ability')
    })

    it('should contain event type', () => {
      expect(ENTITY_TYPES).toContain('event')
    })
  })

  // ============================================
  // 2. getFieldGroupsForType returns correct groups
  // ============================================

  describe('getFieldGroupsForType', () => {
    it('should return field groups for character type', () => {
      const groups = getFieldGroupsForType('character')
      expect(groups).toHaveLength(3)
      expect(groups).toEqual(CHARACTER_FIELD_GROUPS)
      expect(groups.map(g => g.key)).toEqual(['basic', 'appearance', 'description'])
    })

    it('should return field groups for location type', () => {
      const groups = getFieldGroupsForType('location')
      expect(groups).toHaveLength(3)
      expect(groups).toEqual(LOCATION_FIELD_GROUPS)
      expect(groups.map(g => g.key)).toEqual(['basic', 'geo', 'narrative'])
    })

    it('should return field groups for object type', () => {
      const groups = getFieldGroupsForType('object')
      expect(groups).toHaveLength(3)
      expect(groups).toEqual(OBJECT_FIELD_GROUPS)
      expect(groups.map(g => g.key)).toEqual(['basic', 'info', 'narrative'])
    })

    it('should return field groups for ability type', () => {
      const groups = getFieldGroupsForType('ability')
      expect(groups).toHaveLength(3)
      expect(groups).toEqual(ABILITY_FIELD_GROUPS)
      expect(groups.map(g => g.key)).toEqual(['basic', 'mechanics', 'narrative'])
    })

    it('should return same field groups for magic_ability as ability type', () => {
      const abilityGroups = getFieldGroupsForType('ability')
      const magicAbilityGroups = getFieldGroupsForType('magic_ability')
      expect(magicAbilityGroups).toEqual(abilityGroups)
    })

    it('should return field groups for event type', () => {
      const groups = getFieldGroupsForType('event')
      expect(groups).toHaveLength(2)
      expect(groups).toEqual(EVENT_FIELD_GROUPS)
      expect(groups.map(g => g.key)).toEqual(['basic', 'temporal'])
    })

    it('should return empty array for invalid type', () => {
      const groups = getFieldGroupsForType('invalid' as EntityType)
      expect(groups).toEqual([])
    })
  })

  // ============================================
  // 3. getFieldsForType returns correct field names
  // ============================================

  describe('getFieldsForType', () => {
    it('should return all character fields', () => {
      const fields = getFieldsForType('character')
      expect(fields).toContain('name')
      expect(fields).toContain('age')
      expect(fields).toContain('hair_color')
      expect(fields).toContain('description')
      expect(fields.length).toBeGreaterThan(0)
    })

    it('should return all location fields', () => {
      const fields = getFieldsForType('location')
      expect(fields).toContain('name')
      expect(fields).toContain('location_type')
      expect(fields).toContain('continent')
      expect(fields).toContain('narrative_impact')
    })

    it('should return all object fields', () => {
      const fields = getFieldsForType('object')
      expect(fields).toContain('name')
      expect(fields).toContain('object_type')
      expect(fields).toContain('materials')
      expect(fields).toContain('current_location')
    })

    it('should return all ability fields', () => {
      const fields = getFieldsForType('ability')
      expect(fields).toContain('name')
      expect(fields).toContain('ability_type')
      expect(fields).toContain('mechanism')
      expect(fields).toContain('power_level')
    })

    it('should return all event fields', () => {
      const fields = getFieldsForType('event')
      expect(fields).toContain('name')
      expect(fields).toContain('description')
      expect(fields).toContain('narrative_order')
      expect(fields).toContain('time_label')
    })

    it('should return empty array for invalid type', () => {
      const fields = getFieldsForType('invalid' as EntityType)
      expect(fields).toEqual([])
    })
  })

  // ============================================
  // 4. createEmptyFields creates null-valued fields
  // ============================================

  describe('createEmptyFields', () => {
    it('should create empty fields for character type', () => {
      const fields = createEmptyFields('character')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('age', null)
      expect(fields).toHaveProperty('hair_color', null)
      expect(fields).toHaveProperty('description', null)
      // All values should be null
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create empty fields for location type', () => {
      const fields = createEmptyFields('location')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('continent', null)
      expect(fields).toHaveProperty('narrative_impact', null)
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create empty fields for object type', () => {
      const fields = createEmptyFields('object')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('object_type', null)
      expect(fields).toHaveProperty('materials', null)
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create empty fields for ability type', () => {
      const fields = createEmptyFields('ability')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('mechanism', null)
      expect(fields).toHaveProperty('power_level', null)
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create empty fields for magic_ability type', () => {
      const fields = createEmptyFields('magic_ability')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('ability_type', null)
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create empty fields for event type', () => {
      const fields = createEmptyFields('event')
      expect(fields).toHaveProperty('name', null)
      expect(fields).toHaveProperty('time_label', null)
      expect(fields).toHaveProperty('time_precision', null)
      Object.values(fields).forEach(value => {
        expect(value).toBeNull()
      })
    })

    it('should create fields with keys matching getFieldsForType', () => {
      for (const entityType of ENTITY_TYPES) {
        const fields = createEmptyFields(entityType)
        const fieldNames = getFieldsForType(entityType)
        expect(Object.keys(fields)).toEqual(fieldNames)
      }
    })
  })

  // ============================================
  // 5. ENTITY_TYPE_META has entries for all 6 types
  // ============================================

  describe('ENTITY_TYPE_META', () => {
    it('should have entry for character type', () => {
      expect(ENTITY_TYPE_META.character).toBeDefined()
      expect(ENTITY_TYPE_META.character).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.character).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.character).toHaveProperty('color')
    })

    it('should have entry for location type', () => {
      expect(ENTITY_TYPE_META.location).toBeDefined()
      expect(ENTITY_TYPE_META.location).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.location).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.location).toHaveProperty('color')
    })

    it('should have entry for object type', () => {
      expect(ENTITY_TYPE_META.object).toBeDefined()
      expect(ENTITY_TYPE_META.object).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.object).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.object).toHaveProperty('color')
    })

    it('should have entry for ability type', () => {
      expect(ENTITY_TYPE_META.ability).toBeDefined()
      expect(ENTITY_TYPE_META.ability).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.ability).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.ability).toHaveProperty('color')
    })

    it('should have entry for magic_ability type', () => {
      expect(ENTITY_TYPE_META.magic_ability).toBeDefined()
      expect(ENTITY_TYPE_META.magic_ability).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.magic_ability).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.magic_ability).toHaveProperty('color')
    })

    it('should have entry for event type', () => {
      expect(ENTITY_TYPE_META.event).toBeDefined()
      expect(ENTITY_TYPE_META.event).toHaveProperty('labelKey')
      expect(ENTITY_TYPE_META.event).toHaveProperty('icon')
      expect(ENTITY_TYPE_META.event).toHaveProperty('color')
    })

    it('should have all required properties with string values', () => {
      for (const entityType of ENTITY_TYPES) {
        const meta = ENTITY_TYPE_META[entityType]
        expect(typeof meta.labelKey).toBe('string')
        expect(typeof meta.icon).toBe('string')
        expect(typeof meta.color).toBe('string')
      }
    })
  })

  // ============================================
  // 6. TEXTAREA_FIELDS includes required fields
  // ============================================

  describe('TEXTAREA_FIELDS', () => {
    it('should include description field', () => {
      expect(TEXTAREA_FIELDS.has('description')).toBe(true)
    })

    it('should include narrative fields', () => {
      expect(TEXTAREA_FIELDS.has('narrative_role')).toBe(true)
      expect(TEXTAREA_FIELDS.has('narrative_impact')).toBe(true)
      expect(TEXTAREA_FIELDS.has('narrative_importance')).toBe(true)
    })

    it('should include character appearance fields', () => {
      expect(TEXTAREA_FIELDS.has('face_structure')).toBe(true)
      expect(TEXTAREA_FIELDS.has('other_visual_features')).toBe(true)
      expect(TEXTAREA_FIELDS.has('common_clothing')).toBe(true)
    })

    it('should include ability mechanism fields', () => {
      expect(TEXTAREA_FIELDS.has('mechanism')).toBe(true)
      expect(TEXTAREA_FIELDS.has('activation_conditions')).toBe(true)
      expect(TEXTAREA_FIELDS.has('limitations')).toBe(true)
    })

    it('should include object special properties field', () => {
      expect(TEXTAREA_FIELDS.has('special_properties')).toBe(true)
    })

    it('should include event temporal fields', () => {
      expect(TEXTAREA_FIELDS.has('temporal_notes')).toBe(true)
      expect(TEXTAREA_FIELDS.has('time_label')).toBe(true)
    })
  })

  // ============================================
  // 7. Event type has proper temporal fields
  // ============================================

  describe('Event temporal fields', () => {
    it('should have name field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('name')
    })

    it('should have description field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('description')
    })

    it('should have narrative_order field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('narrative_order')
    })

    it('should have time_label field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('time_label')
    })

    it('should have time_start field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('time_start')
    })

    it('should have time_end field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('time_end')
    })

    it('should have time_precision field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('time_precision')
    })

    it('should have temporal_notes field', () => {
      const eventFields = getFieldsForType('event')
      expect(eventFields).toContain('temporal_notes')
    })

    it('should have all 8 temporal fields in correct order', () => {
      const eventFields = getFieldsForType('event')
      const expectedFields = [
        'name',
        'description',
        'narrative_order',
        'time_label',
        'time_start',
        'time_end',
        'time_precision',
        'temporal_notes',
      ]
      expect(eventFields).toEqual(expectedFields)
    })
  })

  // ============================================
  // 8. Location, Object, Ability don't have
  //    relationship-like fields
  // ============================================

  describe('Removed relationship-like fields', () => {
    describe('Location type', () => {
      it('should not have parent_location field', () => {
        const locationFields = getFieldsForType('location')
        expect(locationFields).not.toContain('parent_location')
      })

      it('should not have related_events field', () => {
        const locationFields = getFieldsForType('location')
        expect(locationFields).not.toContain('related_events')
      })

      it('should not have related_characters field', () => {
        const locationFields = getFieldsForType('location')
        expect(locationFields).not.toContain('related_characters')
      })
    })

    describe('Object type', () => {
      it('should not have owners field', () => {
        const objectFields = getFieldsForType('object')
        expect(objectFields).not.toContain('owners')
      })

      it('should not have related_characters field', () => {
        const objectFields = getFieldsForType('object')
        expect(objectFields).not.toContain('related_characters')
      })

      it('should not have related_events field', () => {
        const objectFields = getFieldsForType('object')
        expect(objectFields).not.toContain('related_events')
      })
    })

    describe('Ability type', () => {
      it('should not have magic_system field', () => {
        const abilityFields = getFieldsForType('ability')
        expect(abilityFields).not.toContain('magic_system')
      })

      it('should not have users field', () => {
        const abilityFields = getFieldsForType('ability')
        expect(abilityFields).not.toContain('users')
      })

      it('should not have related_events field', () => {
        const abilityFields = getFieldsForType('ability')
        expect(abilityFields).not.toContain('related_events')
      })
    })
  })

  // ============================================
  // Integration tests
  // ============================================

  describe('Integration tests', () => {
    it('all entity types should have at least one field group', () => {
      for (const entityType of ENTITY_TYPES) {
        const groups = getFieldGroupsForType(entityType)
        expect(groups.length).toBeGreaterThan(0)
      }
    })

    it('all entity types should have at least one field', () => {
      for (const entityType of ENTITY_TYPES) {
        const fields = getFieldsForType(entityType)
        expect(fields.length).toBeGreaterThan(0)
      }
    })

    it('field groups should have no duplicate fields within a type', () => {
      for (const entityType of ENTITY_TYPES) {
        const groups = getFieldGroupsForType(entityType)
        const allFields: string[] = []
        for (const group of groups) {
          allFields.push(...group.fields)
        }
        const uniqueFields = new Set(allFields)
        expect(uniqueFields.size).toBe(allFields.length)
      }
    })

    it('all fields from groups should be returned by getFieldsForType', () => {
      for (const entityType of ENTITY_TYPES) {
        const groups = getFieldGroupsForType(entityType)
        const fieldsFromGroups = groups.flatMap(g => g.fields)
        const fieldsFromFunction = getFieldsForType(entityType)
        expect(fieldsFromFunction).toEqual(fieldsFromGroups)
      }
    })

    it('createEmptyFields should create object with correct keys for each type', () => {
      for (const entityType of ENTITY_TYPES) {
        const empty = createEmptyFields(entityType)
        const fields = getFieldsForType(entityType)
        expect(Object.keys(empty).sort()).toEqual(fields.sort())
      }
    })
  })
})
