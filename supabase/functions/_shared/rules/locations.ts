// ============================================
// Location Rules
// ============================================
// The legacy LOCATION_RULES contract is shared by the existing sub-base
// profiles. Dynamic place rules are kept separately for sub-base-locations so
// adding a new place schema cannot silently change older extraction profiles.
// ============================================
import { getMultilingualLocationBlockWords } from './language-rules.ts';

export const PLACE_TYPE_CATALOG = {
  cosmic: ['universe', 'parallel_universe', 'dimension', 'plane', 'galaxy', 'star_system', 'world', 'moon'],
  geography: ['continent', 'subcontinent', 'island', 'archipelago', 'peninsula', 'sea', 'ocean', 'lake', 'river', 'mountain', 'mountain_range', 'desert', 'forest', 'natural_region'],
  governance: ['country', 'province', 'kingdom', 'colony', 'empire', 'territory', 'principality', 'duchy', 'republic', 'city_state'],
  settlement: ['city', 'capital', 'town', 'village', 'colony_settlement', 'settlement', 'farm', 'fief', 'trading_post', 'outpost'],
  structure: ['neighborhood', 'district', 'street', 'square', 'market', 'harbor', 'complex', 'building', 'villa', 'fort', 'castle', 'palace', 'temple', 'place_of_worship', 'tower'],
  dwelling: ['house', 'cabin', 'apartment', 'room', 'tent', 'basement', 'attic', 'courtyard', 'garden'],
} as const;

export const ALL_PLACE_TYPES = Object.values(PLACE_TYPE_CATALOG).flat();

/** Existing location behavior used by sub-base and sub-base-2. */
export const LOCATION_RULES = {
  requiresDistinctIdentity: true,
  blockWords: getMultilingualLocationBlockWords(['he', 'en']) as Set<string>,
  supportedLanguages: ['he', 'en', 'ar', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ja', 'zh'] as const,
  validTypes: [
    'continent', 'country', 'region', 'city', 'village',
    'building', 'room', 'landmark', 'wilderness', 'other',
  ] as const,
  consolidation: {
    preferSpecificName: true,
    treatHeHayediaAsIdentical: true,
    treatNikudAsIdentical: true,
  },
  fields: [
    'name', 'location_type', 'parent_location', 'description',
    'continent', 'country', 'region', 'city',
    'narrative_impact', 'narrative_importance', 'related_events', 'related_characters',
  ] as const,
} as const;

/** Dynamic place contract used only by sub-base-locations. */
export const LOCATION_PROFILE_RULES = {
  ...LOCATION_RULES,
  validTypes: [...ALL_PLACE_TYPES, 'other'] as const,
  categories: PLACE_TYPE_CATALOG,
  fields: [
    'name', 'place_type', 'description', 'narrative_importance', 'narrative_impact', 'custom_fields',
  ] as const,
} as const;
