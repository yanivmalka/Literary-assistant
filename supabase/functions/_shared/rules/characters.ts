// ============================================
// Character Rules
// ============================================
// Defines what constitutes a valid character entity and how
// characters should be extracted, filtered, and displayed.
// ============================================

export const CHARACTER_RULES = {
  /**
   * Core rule: Only characters with proper names (first name or surname) are extracted.
   * Generic role references are never standalone entities.
   */
  requiresProperName: true,

  /**
   * Patterns that indicate a role-based reference, not a proper name.
   * These should NEVER be extracted as standalone character entities.
   * They may appear as aliases of a named character if context confirms identity.
   */
  blockPatterns: [
    // Family role references — all forms (with or without "של X")
    /^(אבא|אמא|אמו|אביה?|אביו|אימא|אימו|אימה?|אחי?|אחיו|אחות|אחותו|סבא?|סבו|סבתא?|סבתו|דוד|דודו|דודה|דודתו|בן|בנו|בת|בתו|ילד|ילדה)(\s+של\s+.+)?$/,
    // Generic descriptive references
    /^(המנחה|המורה|המדריך|הזקן|הזקנה|הנער|הנערה|הבחור|הבחורה|האיש|האישה|החייל|הקוסם|הקוסמת|הילד|הילדה|המלך|המלכה|הנסיך|הנסיכה|השומר|העבד|הסוחר|הכומר|הרופא|הגנב|הלוחם|השוטר)$/,
    // Relationship references with "של" — all forms
    /^(אבא|אמא|אמו|אביו|אביה|אימו|אימה|אח|אחי|אחיו|אחות|אחותו|סבא|סבו|סבתא|סבתו|בן|בנו|בת|בתו|דוד|דודו|דודה|דודתו)\s+של\s+/,
  ] as RegExp[],

  /**
   * Name consolidation rules:
   * - If same character appears with short name and full name → prefer full name as canonical
   * - Short name becomes alias
   * - Hebrew nikud differences = same character
   * - Example: "ליאו" + "ליאו סייג'" → canonical: "ליאו סייג'", aliases: ["ליאו"]
   */
  consolidation: {
    preferLongerName: true,
    treatNikudAsIdentical: true,
  },

  /**
   * The 4 key display attributes shown directly on character cards.
   * These are prioritized during extraction.
   */
  displayAttributes: ['age', 'height', 'eye_color', 'hair_color'] as const,

  /**
   * All structured fields that can be extracted for a character.
   */
  fields: [
    'name', 'age', 'gender', 'height',
    'hair_color', 'eye_color', 'face_structure', 'cheekbones',
    'eye_shape', 'forehead', 'nose', 'beard_mustache',
    'common_clothing', 'jewelry', 'scars', 'tattoos',
    'other_visual_features',
    'description', 'narrative_role', 'narrative_impact',
  ] as const,

  /**
   * Minimum name length to be considered valid (single letters are not names).
   */
  minNameLength: 2,
} as const;
