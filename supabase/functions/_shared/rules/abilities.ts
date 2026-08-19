// ============================================
// Ability Rules
// ============================================
// Defines what constitutes a valid ability entity.
// Abilities are divided into physical and magical.
// Ordinary actions (running, walking) are NOT abilities.
// General magic systems are NOT extracted — only specific usable abilities.
// ============================================

export const ABILITY_RULES = {
  /**
   * Core rule: An ability must be a DISTINCT, SPECIAL capability.
   * Ordinary human actions are not abilities.
   * General magic system concepts are not abilities.
   */
  requiresDistinctCapability: true,

  /**
   * The two subtypes. Both use the same data model (AbilityFields)
   * but are stored with different entity_type values and displayed
   * in separate UI tabs.
   */
  subtypes: {
    physical: {
      entityType: "ability",
      description: "Exceptional physical/combat abilities, special techniques, trained skills beyond ordinary",
      examples: ["לחימה בשתי חרבות", "קריאת שפתיים", "חוש כיוון מושלם"],
    },
    magical: {
      entityType: "magic_ability",
      description: "Magical powers, spells, supernatural abilities that characters can USE",
      examples: ["רונת אש", "יכולת ראייה דרך קירות", "טלקינזיס"],
    },
  },

  /**
   * Things that are NOT abilities and should NOT be extracted:
   */
  notAbilities: [
    "Ordinary actions: running, walking, talking, eating, sleeping",
    "General magic system concepts (e.g., 'the use of runes' as a system)",
    "Vague references to 'power' without specifics",
    "Emotional states or personality traits",
  ],

  /**
   * Magic system rule: Do NOT extract general magic systems.
   * If text describes a magic system (e.g., "Rune magic"), it should NOT
   * become an entity. Only SPECIFIC abilities within that system
   * (e.g., "Fire Rune") should be extracted.
   */
  noMagicSystems: true,

  /**
   * Consolidation: same ability with different references = one entity.
   */
  consolidation: {
    treatNikudAsIdentical: true,
    preferSpecificName: true,
  },

  /**
   * All structured fields for an ability (shared between physical and magical).
   */
  fields: [
    'name', 'ability_type', 'description',
    'mechanism', 'activation_conditions', 'limitations', 'cost', 'power_level',
    'magic_system', 'users',
    'narrative_impact', 'related_events',
  ] as const,
} as const;
