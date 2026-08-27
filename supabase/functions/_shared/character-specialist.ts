import type {
  ExpertExtractionResult,
  ExpertSourceReference,
  ExpertWindow,
} from "./parallel-experts.ts";

/** Product-facing profile for the first character specialist in Sub-base C. */
export const CHARACTER_SPECIALIST_PROFILE = "sub-base-c-characters" as const;
export const CHARACTER_SPECIALIST_ROLE = "characters" as const;
export const CHARACTER_SPECIALIST_CONTRACT_VERSION = 1 as const;

/** Model A's isolated model chain for the explicit Sub-base C rollout. */
export const CHARACTER_SPECIALIST_PRIMARY_MODEL = "gemini-3.5-flash-lite" as const;
export const CHARACTER_SPECIALIST_FALLBACK_MODEL = "gemini-3.5-flash" as const;

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

/** Future extensions are intentionally reserved, not extracted in Model A yet. */
export const CHARACTER_FUTURE_EXTENSION_KEYS = [
  "abilities",
  "magic_abilities",
  "objects",
] as const;

export interface CharacterFieldObservation {
  value: unknown;
  evidence: ExpertSourceReference[];
  confidence: number | null;
  inferred: boolean;
  inference_note?: string | null;
}

export interface CharacterSpecialistCandidate {
  name: string;
  first_name: string;
  last_name?: string | null;
  aliases: string[];
  fields: Record<string, CharacterFieldObservation>;
  evidence: string[];
  chunk_positions: number[];
  source_references: ExpertSourceReference[];
  confidence: number | null;
}

export interface CharacterRelationshipCandidate {
  source: string;
  target: string;
  relationship_type: CharacterRelationshipType;
  evidence: string[];
  chunk_positions: number[];
  source_references: ExpertSourceReference[];
  confidence: number | null;
  inferred: boolean;
  inference_note?: string | null;
}

export interface CharacterSpecialistResult {
  contract_version: typeof CHARACTER_SPECIALIST_CONTRACT_VERSION;
  role: typeof CHARACTER_SPECIALIST_ROLE;
  window: ExpertWindow;
  characters: CharacterSpecialistCandidate[];
  relationships: CharacterRelationshipCandidate[];
  unresolved_references: string[];
  /** Opaque extension point; Model A must leave these empty/absent for now. */
  future_extensions?: Record<string, unknown>;
}

export type CharacterSpecialistValidation =
  | { valid: true; value: CharacterSpecialistResult }
  | { valid: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0);
}

function isConfidence(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isSourceReference(value: unknown): value is ExpertSourceReference {
  if (!isRecord(value)) return false;
  if (typeof value.chunk_position !== "number" || !Number.isInteger(value.chunk_position) || value.chunk_position < 0) {
    return false;
  }
  return (value.quote === undefined || value.quote === null || typeof value.quote === "string")
    && (value.page === undefined || value.page === null || typeof value.page === "number")
    && (value.start_offset === undefined || value.start_offset === null || typeof value.start_offset === "number")
    && (value.end_offset === undefined || value.end_offset === null || typeof value.end_offset === "number");
}

function isSourceReferenceArray(value: unknown): value is ExpertSourceReference[] {
  return Array.isArray(value) && value.every(isSourceReference);
}

function isWindow(value: unknown): value is ExpertWindow {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.window_id)
    && typeof value.offset === "number"
    && Number.isInteger(value.offset)
    && value.offset >= 0
    && typeof value.limit === "number"
    && Number.isInteger(value.limit)
    && value.limit > 0
    && isNumberArray(value.chunk_positions);
}

function isFieldObservation(value: unknown): value is CharacterFieldObservation {
  if (!isRecord(value)) return false;
  const evidence = value.evidence;
  return "value" in value
    && isSourceReferenceArray(evidence)
    && evidence.length > 0
    && isConfidence(value.confidence)
    && typeof value.inferred === "boolean"
    && (value.inference_note === undefined
      || value.inference_note === null
      || typeof value.inference_note === "string");
}

function isCharacterFieldKey(value: string): boolean {
  // Unknown stable keys are allowed for project-defined custom fields.
  return /^[a-z][a-z0-9_]{1,63}$/.test(value);
}

function isCandidate(value: unknown): value is CharacterSpecialistCandidate {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.name) || !isNonEmptyString(value.first_name)) return false;
  if (value.last_name !== undefined && value.last_name !== null && typeof value.last_name !== "string") return false;
  if (!isStringArray(value.aliases) || !isRecord(value.fields)) return false;
  if (!Object.entries(value.fields).every(([key, field]) => isCharacterFieldKey(key) && isFieldObservation(field))) return false;
  return isStringArray(value.evidence)
    && isNumberArray(value.chunk_positions)
    && isSourceReferenceArray(value.source_references)
    && isConfidence(value.confidence);
}

function isRelationship(value: unknown): value is CharacterRelationshipCandidate {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.source)
    && isNonEmptyString(value.target)
    && value.source.trim().toLocaleLowerCase() !== value.target.trim().toLocaleLowerCase()
    && isCharacterRelationshipType(value.relationship_type)
    && isStringArray(value.evidence)
    && isNumberArray(value.chunk_positions)
    && isSourceReferenceArray(value.source_references)
    && isConfidence(value.confidence)
    && typeof value.inferred === "boolean"
    && (value.inference_note === undefined
      || value.inference_note === null
      || typeof value.inference_note === "string");
}

export function isCharacterRelationshipType(value: unknown): value is CharacterRelationshipType {
  return typeof value === "string"
    && (CHARACTER_RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

function hasFirstNameAlias(candidate: CharacterSpecialistCandidate): boolean {
  const firstName = candidate.first_name.trim().toLocaleLowerCase();
  return candidate.aliases.some((alias) => alias.trim().toLocaleLowerCase() === firstName);
}

/**
 * Validates Model A's role-specific contract before it can reach the generic
 * expert artifact or canonical persistence layers.
 */
export function validateCharacterSpecialistResult(value: unknown): CharacterSpecialistValidation {
  if (!isRecord(value)) return { valid: false, errors: ["result must be an object"] };

  const errors: string[] = [];
  if (value.contract_version !== CHARACTER_SPECIALIST_CONTRACT_VERSION) {
    errors.push("unsupported character contract_version");
  }
  if (value.role !== CHARACTER_SPECIALIST_ROLE) errors.push("role must be characters");
  if (!isWindow(value.window)) errors.push("window is invalid");
  if (!Array.isArray(value.characters) || !value.characters.every(isCandidate)) {
    errors.push("characters contains an invalid candidate");
  }
  if (!Array.isArray(value.relationships) || !value.relationships.every(isRelationship)) {
    errors.push("relationships contains an invalid candidate");
  }
  if (!isStringArray(value.unresolved_references)) {
    errors.push("unresolved_references must be a string array");
  }
  if (value.future_extensions !== undefined && !isRecord(value.future_extensions)) {
    errors.push("future_extensions must be an object when present");
  }

  if (Array.isArray(value.characters)) {
    for (const [index, candidate] of value.characters.entries()) {
      if (!isCandidate(candidate)) continue;
      if (candidate.fields.first_name && candidate.fields.first_name.value !== candidate.first_name) {
        errors.push(`characters[${index}].fields.first_name must match first_name`);
      }
      if (hasFirstNameAlias(candidate)) {
        errors.push(`characters[${index}].aliases must not contain first_name`);
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: value as unknown as CharacterSpecialistResult };
}

/**
 * Adapts the validated Model A contract to the generic artifact contract.
 * The original character contract remains in raw_response; this adapter keeps
 * the existing merger/writer shape while preserving field-level provenance.
 */
export function characterSpecialistToExpertExtractionResult(
  result: CharacterSpecialistResult,
): ExpertExtractionResult {
  return {
    contract_version: 1,
    role: CHARACTER_SPECIALIST_ROLE,
    window: result.window,
    entities: result.characters.map((character) => {
      const fields: Record<string, unknown> = {
        first_name: character.first_name,
      };
      if (character.last_name !== undefined && character.last_name !== null) {
        fields.last_name = character.last_name;
      }
      for (const [key, observation] of Object.entries(character.fields)) {
        fields[key] = observation.value;
      }
      return {
        name: character.name,
        entity_type: "character",
        aliases: character.aliases,
        fields,
        field_observations: character.fields,
        evidence: character.evidence,
        chunk_positions: character.chunk_positions,
        source_references: character.source_references,
        confidence: character.confidence,
      };
    }),
    events: [],
    relationships: result.relationships.map((relationship) => ({
      source: relationship.source,
      target: relationship.target,
      relationship_type: relationship.relationship_type,
      evidence: relationship.evidence,
      chunk_positions: relationship.chunk_positions,
      source_references: relationship.source_references,
      confidence: relationship.confidence,
      inferred: relationship.inferred,
      inference_note: relationship.inference_note ?? null,
    })),
    unresolved_references: result.unresolved_references,
  };
}
