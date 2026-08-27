export const CHARACTER_FIELD_KEYS = [
  "first_name",
  "last_name",
  "aliases",
  "age",
  "gender",
  "sexual_orientation",
  "pronouns",
  "occupation",
  "hobbies",
  "favorite_foods",
  "disliked_foods",
  "religion",
  "beliefs",
  "race",
  "height",
  "narrative_role",
  "status",
  "personality_traits",
  "strengths",
  "weaknesses",
  "fears",
  "goals_and_desires",
  "values_and_principles",
  "habits_and_mannerisms",
  "speech_style",
  "secrets",
  "emotional_state",
  "eye_color",
  "eye_shape",
  "eye_size",
  "skin_color",
  "hair_color",
  "hair_type",
  "tattoos",
  "scars",
  "jewelry",
  "body_type",
  "facial_features",
  "distinguishing_features",
  "typical_clothing",
  "posture_and_body_language",
  "appearance_traits",
] as const;

export type CharacterFieldKey = typeof CHARACTER_FIELD_KEYS[number];

/**
 * `no_significant_bond` is persisted for analysis but intentionally hidden in
 * the product relationship view.
 */
export const CHARACTER_RELATIONSHIP_TYPES = [
  "acquaintance",
  "friendship",
  "friendship_deep",
  "family",
  "romantic_relationship",
  "hostility",
  "rivalry",
  "alliance",
  "mentorship",
  "work_subordinate",
  "work_supervisor",
  "protection_or_dependency",
  "no_significant_bond",
] as const;

export type CharacterRelationshipType = typeof CHARACTER_RELATIONSHIP_TYPES[number];

/**
 * Relationship types whose meaning does not depend on edge direction. For these,
 * A->B and B->A describe the same bond and must collapse to a single stored row.
 * The remaining types (mentorship, work_subordinate, work_supervisor,
 * protection_or_dependency) are directional and are never reordered.
 */
export const SYMMETRIC_CHARACTER_RELATIONSHIP_TYPES = new Set<string>([
  "acquaintance",
  "friendship",
  "friendship_deep",
  "family",
  "romantic_relationship",
  "hostility",
  "rivalry",
  "alliance",
  "no_significant_bond",
]);

export function isSymmetricCharacterRelationship(type: unknown): boolean {
  return typeof type === "string" && SYMMETRIC_CHARACTER_RELATIONSHIP_TYPES.has(type);
}
