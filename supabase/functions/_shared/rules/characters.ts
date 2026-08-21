// ============================================
// Character Rules
// ============================================
// Defines what constitutes a valid character entity and how
// characters should be extracted, filtered, and displayed.
// ============================================

import { getMultilingualCharacterPatterns } from './language-rules.ts';

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
   * 
   * Now supports multiple languages (Hebrew, English, Arabic, French, etc.)
   * Auto-detects language or uses specified language codes.
   * 
   * To support new languages, update language-rules.ts
   * 
   * REGEX BREAKDOWN:
   * - Pattern 1: Family roles ± possessive with optional relationship reference
   * - Pattern 2: Generic descriptors (e.g., "the man", "המנחה") — exactly these words
   * - Pattern 3: "Role של ..." or "Role of ..." — relationship descriptors
   */
  blockPatterns: getMultilingualCharacterPatterns(['he', 'en']) as RegExp[],
  
  /**
   * Language codes supported for character blocking.
   * To add a new language, update this array and add patterns to language-rules.ts
   */
  supportedLanguages: ['he', 'en', 'ar', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ja', 'zh'] as const,

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

