// ============================================
// Extraction Configuration
// ============================================
// Defines the entity types the system extracts, their DB type values,
// fields, and classification rules.
// This is the single source of truth for "what entity types exist."
// ============================================

/**
 * Configuration for a single entity type in the extraction system.
 */
export interface EntityTypeConfig {
  /** The entity_type value stored in the database */
  dbType: string;
  /** Human-readable label key (for i18n) */
  labelKey: string;
  /** Whether this type is actively extracted by the AI */
  extracted: boolean;
  /** Whether this type can be created manually by users */
  manualCreation: boolean;
  /** The structured fields this type supports */
  fields: readonly string[];
}

/**
 * All entity types in the system.
 * This is the canonical list — UI tabs, store filters, and extraction
 * all derive from this configuration.
 */
export const ENTITY_TYPE_DEFINITIONS: Record<string, EntityTypeConfig> = {
  character: {
    dbType: "character",
    labelKey: "entities.types.character",
    extracted: true,
    manualCreation: true,
    fields: [
      "name", "age", "gender", "height",
      "hair_color", "eye_color", "face_structure", "cheekbones",
      "eye_shape", "forehead", "nose", "beard_mustache",
      "common_clothing", "jewelry", "scars", "tattoos",
      "other_visual_features",
      "description", "narrative_role", "narrative_impact",
    ],
  },
  location: {
    dbType: "location",
    labelKey: "entities.types.location",
    extracted: true,
    manualCreation: true,
    fields: [
      "name", "place_type", "description", "narrative_importance", "narrative_impact", "custom_fields",
    ],
  },
  object: {
    dbType: "object",
    labelKey: "entities.types.object",
    extracted: true,
    manualCreation: true,
    fields: [
      "name", "object_type", "description", "appearance", "materials", "special_properties",
      "origin", "current_location", "owners",
      "narrative_importance", "narrative_impact", "related_characters", "related_events",
    ],
  },
  ability: {
    dbType: "ability",
    labelKey: "entities.types.ability",
    extracted: true,
    manualCreation: true,
    fields: [
      "name", "ability_type", "description",
      "mechanism", "activation_conditions", "limitations", "cost", "power_level",
      "magic_system", "users",
      "narrative_impact", "related_events",
    ],
  },
  magic_ability: {
    dbType: "magic_ability",
    labelKey: "entities.types.magic_ability",
    extracted: true,
    manualCreation: true,
    fields: [
      "name", "ability_type", "description",
      "mechanism", "activation_conditions", "limitations", "cost", "power_level",
      "magic_system", "users",
      "narrative_impact", "related_events",
    ],
  },
} as const;

/**
 * Source priority for field values.
 * Higher priority sources never get overwritten by lower priority ones.
 */
export const SOURCE_PRIORITY = {
  user: 2,      // Manually entered by user — highest priority
  document: 1,  // Extracted from document by AI
} as const;

/**
 * Data handling rules for extraction:
 */
export const EXTRACTION_DATA_RULES = {
  /** Missing information stored as NULL in DB, displayed as "לא ידוע" in UI */
  missingValue: null,
  /** Display string for null values in UI */
  unknownDisplayText: "לא ידוע",
  /** AI must never invent information — only extract what's in the text */
  noInvention: true,
  /** Incremental updates: only fill NULL fields, never overwrite existing */
  incrementalMerge: true,
  /** User data is never overwritten by extraction */
  userDataProtected: true,
} as const;
