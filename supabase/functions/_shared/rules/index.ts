// ============================================
// Entity System Rules — Central Configuration
// ============================================
//
// This is the single source of truth for all entity extraction rules.
// All domain logic for what constitutes a valid entity, how entities
// are normalized, filtered, and classified lives here.
//
// Architecture:
//   Rules (this directory) → defines what the system considers valid
//   Extraction (extract-knowledge) → uses rules to extract from text
//   Post-processing → uses rules for filtering and normalization
//   Database → stores the results (no domain logic)
//   UI → displays the results (no domain logic)
//
// To change a rule (e.g., add a location blockword):
//   1. Edit the relevant file in this directory
//   2. Redeploy the edge function
//   No DB migration, no store change, no UI change needed.
// ============================================

export { ENTITY_TYPE_DEFINITIONS, type EntityTypeConfig } from "./extraction.ts";
export { CHARACTER_RULES } from "./characters.ts";
export { LOCATION_RULES } from "./locations.ts";
export { OBJECT_RULES } from "./objects.ts";
export { ABILITY_RULES } from "./abilities.ts";
export { NORMALIZATION_RULES, normalizeKey, stripNikud } from "./normalization.ts";
export { shouldFilterEntity, type FilterableEntity } from "./filtering.ts";
export { buildExtractionPrompt } from "./prompt.ts";
