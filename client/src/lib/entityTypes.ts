// ============================================
// Entity Type Definitions
// Defines structured fields for each of the 5 entity types:
// Characters, Locations, Objects, Abilities (physical), Magic Abilities
//
// All fields are nullable (string | null) — no field is required.
// NULL in DB, displayed as "לא ידוע" in UI.
// ============================================

// ============================================
// Entity Type Constants
// ============================================

export const ENTITY_TYPES = ['character', 'location', 'object', 'ability', 'magic_ability'] as const
export type EntityType = typeof ENTITY_TYPES[number]

// ============================================
// 1. Characters
// ============================================

export interface CharacterFields {
  // Basic details
  name: string | null
  age: string | null
  gender: string | null
  height: string | null

  // Appearance
  hair_color: string | null
  eye_color: string | null
  face_structure: string | null
  cheekbones: string | null
  eye_shape: string | null
  forehead: string | null
  nose: string | null
  beard_mustache: string | null
  common_clothing: string | null
  jewelry: string | null
  scars: string | null
  tattoos: string | null
  other_visual_features: string | null

  // Description
  description: string | null
  narrative_role: string | null
  narrative_impact: string | null
}

export const CHARACTER_FIELD_GROUPS = [
  {
    key: 'basic',
    labelKey: 'entityFields.groups.basic',
    fields: ['name', 'age', 'gender', 'height'] as (keyof CharacterFields)[],
  },
  {
    key: 'appearance',
    labelKey: 'entityFields.groups.appearance',
    fields: [
      'hair_color', 'eye_color', 'face_structure', 'cheekbones',
      'eye_shape', 'forehead', 'nose', 'beard_mustache',
      'common_clothing', 'jewelry', 'scars', 'tattoos',
      'other_visual_features',
    ] as (keyof CharacterFields)[],
  },
  {
    key: 'description',
    labelKey: 'entityFields.groups.description',
    fields: ['description', 'narrative_role', 'narrative_impact'] as (keyof CharacterFields)[],
  },
] as const

// ============================================
// 2. Locations
// ============================================

export interface LocationFields {
  // Basic details
  name: string | null
  location_type: string | null
  parent_location: string | null
  description: string | null

  // Geo hierarchy
  continent: string | null
  country: string | null
  region: string | null
  city: string | null

  // Narrative role
  narrative_impact: string | null
  narrative_importance: string | null
  related_events: string | null
  related_characters: string | null
}

export const LOCATION_FIELD_GROUPS = [
  {
    key: 'basic',
    labelKey: 'entityFields.groups.basic',
    fields: ['name', 'location_type', 'parent_location', 'description'] as (keyof LocationFields)[],
  },
  {
    key: 'geo',
    labelKey: 'entityFields.groups.geo',
    fields: ['continent', 'country', 'region', 'city'] as (keyof LocationFields)[],
  },
  {
    key: 'narrative',
    labelKey: 'entityFields.groups.narrative',
    fields: ['narrative_impact', 'narrative_importance', 'related_events', 'related_characters'] as (keyof LocationFields)[],
  },
] as const

// ============================================
// 3. Objects
// ============================================

export interface ObjectFields {
  // Basic details
  name: string | null
  object_type: string | null
  description: string | null
  appearance: string | null
  materials: string | null
  special_properties: string | null

  // Info
  origin: string | null
  current_location: string | null
  owners: string | null

  // Narrative role
  narrative_importance: string | null
  narrative_impact: string | null
  related_characters: string | null
  related_events: string | null
}

export const OBJECT_FIELD_GROUPS = [
  {
    key: 'basic',
    labelKey: 'entityFields.groups.basic',
    fields: ['name', 'object_type', 'description', 'appearance', 'materials', 'special_properties'] as (keyof ObjectFields)[],
  },
  {
    key: 'info',
    labelKey: 'entityFields.groups.info',
    fields: ['origin', 'current_location', 'owners'] as (keyof ObjectFields)[],
  },
  {
    key: 'narrative',
    labelKey: 'entityFields.groups.narrative',
    fields: ['narrative_importance', 'narrative_impact', 'related_characters', 'related_events'] as (keyof ObjectFields)[],
  },
] as const

// ============================================
// 4. Abilities (shared structure for physical and magical)
// The distinction is via ability_type field: "physical" | "magical"
// UI shows them in separate tabs but they share the same data model.
// ============================================

export interface AbilityFields {
  // Basic details
  name: string | null
  ability_type: string | null  // "physical" | "magical"
  description: string | null

  // Mechanics
  mechanism: string | null
  activation_conditions: string | null
  limitations: string | null
  cost: string | null
  power_level: string | null

  // Connections
  magic_system: string | null
  users: string | null

  // Narrative role
  narrative_impact: string | null
  related_events: string | null
}

export const ABILITY_FIELD_GROUPS = [
  {
    key: 'basic',
    labelKey: 'entityFields.groups.basic',
    fields: ['name', 'ability_type', 'description'] as (keyof AbilityFields)[],
  },
  {
    key: 'mechanics',
    labelKey: 'entityFields.groups.mechanics',
    fields: ['mechanism', 'activation_conditions', 'limitations', 'cost', 'power_level'] as (keyof AbilityFields)[],
  },
  {
    key: 'connections',
    labelKey: 'entityFields.groups.connections',
    fields: ['magic_system', 'users'] as (keyof AbilityFields)[],
  },
  {
    key: 'narrative',
    labelKey: 'entityFields.groups.narrative',
    fields: ['narrative_impact', 'related_events'] as (keyof AbilityFields)[],
  },
] as const

// ============================================
// Union type for all structured fields
// ============================================

export type EntityStructuredFields =
  | CharacterFields
  | LocationFields
  | ObjectFields
  | AbilityFields

// ============================================
// Field group definition type
// ============================================

export interface FieldGroup<T = string> {
  key: string
  labelKey: string
  fields: T[]
}

// ============================================
// Helper: Get field groups for entity type
// ============================================

export function getFieldGroupsForType(entityType: EntityType): FieldGroup<string>[] {
  switch (entityType) {
    case 'character':
      return CHARACTER_FIELD_GROUPS as unknown as FieldGroup<string>[]
    case 'location':
      return LOCATION_FIELD_GROUPS as unknown as FieldGroup<string>[]
    case 'object':
      return OBJECT_FIELD_GROUPS as unknown as FieldGroup<string>[]
    case 'ability':
    case 'magic_ability':
      return ABILITY_FIELD_GROUPS as unknown as FieldGroup<string>[]
    default:
      return []
  }
}

// ============================================
// Helper: Get all field names for entity type
// ============================================

export function getFieldsForType(entityType: EntityType): string[] {
  const groups = getFieldGroupsForType(entityType)
  return groups.flatMap(g => g.fields)
}

// ============================================
// Helper: Create empty structured fields for entity type
// All fields set to null (displayed as "לא ידוע" in UI)
// ============================================

export function createEmptyFields(entityType: EntityType): Record<string, null> {
  const fields = getFieldsForType(entityType)
  const result: Record<string, null> = {}
  for (const field of fields) {
    result[field] = null
  }
  return result
}

// ============================================
// Helper: Long text fields that should use textarea
// ============================================

export const TEXTAREA_FIELDS = new Set([
  'description',
  'narrative_role',
  'narrative_impact',
  'narrative_importance',
  'face_structure',
  'other_visual_features',
  'common_clothing',
  'limitations',
  'mechanism',
  'activation_conditions',
  'special_properties',
  'related_events',
  'related_characters',
])

// ============================================
// Entity type metadata for UI
// ============================================

export const ENTITY_TYPE_META: Record<EntityType, { labelKey: string; icon: string; color: string }> = {
  character: { labelKey: 'entities.types.character', icon: '👤', color: 'blue' },
  location: { labelKey: 'entities.types.location', icon: '📍', color: 'green' },
  object: { labelKey: 'entities.types.object', icon: '🗡️', color: 'amber' },
  ability: { labelKey: 'entities.types.ability', icon: '⚔️', color: 'orange' },
  magic_ability: { labelKey: 'entities.types.magic_ability', icon: '✨', color: 'purple' },
}
