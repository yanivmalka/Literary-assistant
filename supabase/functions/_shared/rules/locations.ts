// ============================================
// Location Rules
// ============================================
// Defines what constitutes a valid location entity.
// Only locations with distinct identity and narrative importance are extracted.
// Now supports multiple languages (Hebrew, English, Arabic, French, etc.)
// ============================================

import { getMultilingualLocationBlockWords, type LanguageCode } from './language-rules.ts';

export const LOCATION_RULES = {
  /**
   * Core rule: Only locations with a DISTINCT IDENTITY are extracted.
   * A distinct identity means the location has a unique name, recurring
   * narrative presence, or specific importance to the plot.
   */
  requiresDistinctIdentity: true,

  /**
   * Generic location nouns that should NOT become entities on their own.
   * These are only valid if paired with a unique identifier
   * (e.g., "חדר" = blocked, "חדרו של ליאו" = might be valid if narratively important).
   * 
   * Now supports multiple languages (Hebrew, English, etc.)
   * Auto-combines blocking words from all supported languages.
   * 
   * TO ADD A BLOCKWORD: Update language-rules.ts, not this file.
   * 
   * Includes:
   * - Hebrew: Indoor spaces (חדר, מטבח, דירה), Outdoor generic (אוהל, גינה), 
   *   Nature generic (יער, נהר, הר), Structures (בית, בניין), Urban (עיר, כפר)
   * - English: room, bedroom, kitchen, forest, city, house, street, etc.
   */
  blockWords: getMultilingualLocationBlockWords(['he', 'en']) as Set<string>,
  
  /**
   * Language codes supported for location blocking.
   * To add a new language, update this array and add block words to language-rules.ts
   */
  supportedLanguages: ['he', 'en', 'ar', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ja', 'zh'] as const,

  /**
   * Location types that the system recognizes.
   */
  validTypes: [
    'continent', 'country', 'region', 'city', 'village',
    'building', 'room', 'landmark', 'wilderness', 'other',
  ] as const,

  /**
   * Consolidation rules for locations:
   * - "העיר" referring to "טרונהיים" → canonical: "טרונהיים", alias: "העיר"
   * - "יער" + "יער אירויין" = same → canonical: "יער אירויין", alias: "היער"
   * - "המישור הארצי" and "מישור הארצי" = same → pick the most natural form
   */
  consolidation: {
    preferSpecificName: true,
    treatHeHayediaAsIdentical: true,
    treatNikudAsIdentical: true,
  },

  /**
   * All structured fields for a location.
   */
  fields: [
    'name', 'location_type', 'parent_location', 'description',
    'continent', 'country', 'region', 'city',
    'narrative_impact', 'narrative_importance', 'related_events', 'related_characters',
  ] as const,
} as const;

