// ============================================
// Object Rules
// ============================================
// Defines what constitutes a valid object entity.
// Only objects with distinct identity, narrative importance,
// or unique/magical properties are extracted.
// ============================================

export const OBJECT_RULES = {
  /**
   * Core rule: Not every noun in the text is an object entity.
   * An object must have at least ONE of:
   * - A unique name (e.g., "חרב הדרקון")
   * - Narrative importance (drives plot, central to a scene)
   * - Special/magical properties
   * - Strong connection to a character (e.g., "חרבו של דארקוליאון")
   */
  requiresSignificance: true,

  /**
   * Generic objects that should NOT become entities unless they have
   * a unique identifier or clear narrative significance.
   * 
   * TO ADD A BLOCKWORD: Simply add it to this set. No other changes needed.
   */
  blockWords: new Set([
    // Furniture
    "שולחן", "כיסא", "מיטה", "ספה", "ארון", "מגירה", "מדף",
    // Common items
    "דלת", "חלון", "קיר", "רצפה", "תקרה", "מדרגות",
    // Food/drink (unless magical)
    "כוס", "צלחת", "סכין", "מזלג", "כף", "קערה",
    // Clothing (unless special)
    "חולצה", "מכנסיים", "נעליים", "גרביים", "כובע",
  ]),

  /**
   * Consolidation: same object with different references = one entity.
   */
  consolidation: {
    preferNamedForm: true,
    treatNikudAsIdentical: true,
  },

  /**
   * All structured fields for an object.
   */
  fields: [
    'name', 'object_type', 'description', 'appearance', 'materials', 'special_properties',
    'origin', 'current_location', 'owners',
    'narrative_importance', 'narrative_impact', 'related_characters', 'related_events',
  ] as const,
} as const;
