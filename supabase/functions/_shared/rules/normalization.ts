// ============================================
// Normalization Rules
// ============================================
// Centralized text normalization for entity name comparison and deduplication.
// These rules ensure that different surface forms of the same entity
// (with/without nikud, with/without ה' הידיעה) are recognized as identical.
// ============================================

export const NORMALIZATION_RULES = {
  /**
   * Hebrew nikud (vocalization marks) should be stripped for comparison.
   * "אָרון" and "ארון" are the same entity.
   */
  stripNikud: true,

  /**
   * ה' הידיעה (definite article) is ignored during comparison.
   * "המישור הארצי" and "מישור הארצי" are the same entity.
   */
  stripHeHayedia: true,

  /**
   * Comparison is case-insensitive (for any Latin characters in names).
   */
  caseInsensitive: true,

  /**
   * When two forms exist, prefer the longer/more complete form as canonical.
   * "ליאו" + "ליאו סייג'" → canonical = "ליאו סייג'"
   */
  preferLongerCanonical: true,

  /**
   * Canonical names are stored WITHOUT nikud in the database.
   */
  storeWithoutNikud: true,
} as const;

// ============================================
// Normalization Functions
// ============================================

/**
 * Remove Hebrew nikud (vocalization marks U+0591–U+05C7) from text.
 */
export function stripNikud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, "");
}

/**
 * Create a normalized key for entity deduplication.
 * Strips nikud, removes leading ה' הידיעה from words, lowercases.
 * Used as the map key when merging entities within a single extraction batch.
 */
export function normalizeKey(name: string): string {
  let normalized = stripNikud(name).trim();
  // Remove leading ה from words that have at least 2 more Hebrew letters after it
  normalized = normalized.replace(/\bה(?=[א-ת]{2,})/g, "");
  return normalized.toLowerCase().trim();
}

/**
 * Prepare a canonical name for database storage.
 * Strips nikud but preserves the natural Hebrew form (including ה' הידיעה).
 */
export function prepareCanonicalName(name: string): string {
  return stripNikud(name).trim();
}
