// ============================================
// Entity Filtering (Post-Processing)
// ============================================
// Applies domain rules to filter out invalid entities AFTER extraction.
// This is a safety net — the LLM prompt should prevent most invalid entities,
// but these filters catch anything that slips through.
// ============================================

import { CHARACTER_RULES } from "./characters.ts";
import { LOCATION_RULES } from "./locations.ts";
import { normalizeKey, stripNikud } from "./normalization.ts";

/**
 * Minimal entity shape needed for filtering decisions.
 */
export interface FilterableEntity {
  canonical_name: string;
  entity_type: string;
}

/**
 * Determine if an entity should be filtered out (not saved to DB).
 * Returns true if the entity should be REJECTED.
 * 
 * This function uses rules from characters.ts and locations.ts.
 * To change filtering behavior, update the rules files — not this function.
 */
export function shouldFilterEntity(entity: FilterableEntity): boolean {
  const name = entity.canonical_name.trim();
  const strippedName = stripNikud(name);
  const normalized = normalizeKey(name);

  // ---- Character filtering ----
  if (entity.entity_type === "character") {
    // Check against block patterns
    for (const pattern of CHARACTER_RULES.blockPatterns) {
      if (pattern.test(name) || pattern.test(strippedName)) return true;
    }
    // Minimum name length
    if (name.length < CHARACTER_RULES.minNameLength) return true;
  }

  // ---- Location filtering ----
  if (entity.entity_type === "location") {
    // Check if the name (with or without ה' הידיעה) is just a generic word
    const withoutHe = name.replace(/^ה/, "");
    const strippedWithoutHe = strippedName.replace(/^ה/, "");
    if (
      LOCATION_RULES.blockWords.has(name) ||
      LOCATION_RULES.blockWords.has(withoutHe) ||
      LOCATION_RULES.blockWords.has(normalized) ||
      LOCATION_RULES.blockWords.has(strippedWithoutHe)
    ) {
      return true;
    }
  }

  // Objects and abilities are primarily filtered by the LLM prompt.
  // No additional code-level blocking is applied here to avoid
  // false positives. The prompt rules are the main filter.

  return false;
}
