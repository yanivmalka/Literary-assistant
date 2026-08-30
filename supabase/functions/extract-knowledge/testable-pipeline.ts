import {
  isCanonicalExtractionPayload,
  referenceName,
  sourceReferencesToLegacyFields,
} from '../_shared/extraction-contract.ts';
import {
  normalizeCharacterAgeObservationMap,
  normalizeSubBaseCCharacterAttributes,
} from '../_shared/character-age.ts';
import {
  CHARACTER_FIELD_KEYS,
  CHARACTER_RELATIONSHIP_TYPES,
  isSymmetricCharacterRelationship,
} from '../_shared/character-specialist.ts';

// Older character extractions emit these key spellings; map them onto the
// canonical Sub-base C field keys so their values are not filtered out later.
const C_COMPAT_FIELD_ALIASES: Record<string, string> = {
  favorite_food: 'favorite_foods',
  dislikes: 'disliked_foods',
  religion_and_beliefs: 'beliefs',
};

// Structural/identity keys are handled explicitly by the adapter and must never
// be lifted from a flat candidate into `attributes` as ordinary fields.
const C_NON_FLAT_FIELD_KEYS = new Set(['first_name', 'last_name', 'aliases']);

function isLiftableFlatValue(value: unknown): boolean {
  return value != null && (typeof value !== 'object' || Array.isArray(value));
}

export type ExtractionMode = 'bootstrap' | 'branch';

export type ExtractionStrategy = 'legacy-sequential';

export const DEFAULT_EXTRACTION_STRATEGY: ExtractionStrategy = 'legacy-sequential';

export interface ExtractionModeRequest {
  extraction_mode?: ExtractionMode;
  target_branch_id?: string | null;
  use_main?: boolean;
}

export type ExtractionValidationResult = {
  ok: true;
  mode: ExtractionMode;
  branchId: string | null;
} | {
  ok: false;
  error: string;
};

export type ExtractionStrategyValidationResult = {
  ok: true;
  strategy: ExtractionStrategy;
} | {
  ok: false;
  error: string;
};

export function validateExtractionStrategy(value: unknown): ExtractionStrategyValidationResult {
  const strategy = value ?? DEFAULT_EXTRACTION_STRATEGY;
  if (strategy === DEFAULT_EXTRACTION_STRATEGY) {
    return { ok: true, strategy: DEFAULT_EXTRACTION_STRATEGY };
  }

  return {
    ok: false,
    error: "Only the legacy-sequential extraction strategy is supported; parallel-experts has been removed.",
  };
}

/** Mirrors the handler's JSON cleanup and fallback object extraction without I/O. */
export function parseExtractionJson<T>(responseText: string): T | null {
  try {
    let jsonText = responseText.trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    return JSON.parse(jsonText) as T;
  } catch {
    try {
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}');
      if (start !== -1 && end > start) return JSON.parse(responseText.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
    return null;
  }
}

export function cloneJsonValue<T>(value: T): T | null {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return null
    return JSON.parse(serialized) as T
  } catch {
    return null
  }
}

type NormalizedExtractionBucket =
  | 'characters'
  | 'locations'
  | 'objects'
  | 'abilities'
  | 'magic_abilities'
  | 'organizations'
  | 'events'
  | 'relationships'

function normalizeExtractionType(value: unknown): NormalizedExtractionBucket | null {
  const rawType = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  switch (rawType) {
    case 'character':
    case 'person':
    case 'people':
      return 'characters'
    case 'location':
    case 'place':
    case 'places':
      return 'locations'
    case 'object':
    case 'item':
    case 'artifact':
      return 'objects'
    case 'ability':
    case 'skill':
    case 'power':
      return 'abilities'
    case 'magic_ability':
    case 'magical_ability':
    case 'magic_power':
    case 'spell':
      return 'magic_abilities'
    case 'organization':
    case 'group':
    case 'faction':
      return 'organizations'
    case 'event':
      return 'events'
    case 'relationship':
      return 'relationships'
    default:
      return null
  }
}

function mergeExtractionBuckets(
  target: Record<string, unknown[]>,
  source: Record<string, unknown[]>,
): void {
  for (const [key, values] of Object.entries(source)) {
    target[key] = [...(target[key] || []), ...values]
  }
}

function normalizeGenericEntityList(items: unknown[]): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {}

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const bucket = normalizeExtractionType(
      record.entity_type ?? record.entityType ?? record.kind ?? record.category ?? record.type,
    )
    if (bucket) (grouped[bucket] ||= []).push(item)
  }

  return grouped
}

function canonicalEntityToLegacy(entity: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof entity.name === 'string' ? entity.name.trim() : ''
  const type = typeof entity.type === 'string' ? entity.type.trim() : ''
  if (!name || !type) return null

  const attributes = entity.attributes && typeof entity.attributes === 'object'
    ? entity.attributes as Record<string, unknown>
    : {}
  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(entity.source_references) ? entity.source_references : undefined,
    Array.isArray(entity.evidence) ? entity.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(entity.chunk_positions) ? entity.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...entity,
    ...attributes,
    name,
    type,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function canonicalRelationshipToLegacy(relationship: Record<string, unknown>): Record<string, unknown> | null {
  const sourceValue = relationship.source ?? relationship.character_a
  const targetValue = relationship.target ?? relationship.character_b
  const source = referenceName(sourceValue)
  const target = referenceName(targetValue)
  const type = typeof (relationship.type ?? relationship.relationship_type) === 'string'
    ? String(relationship.type ?? relationship.relationship_type).trim()
    : ''
  if (!source || !target || !type) return null

  const sourceType = sourceValue && typeof sourceValue === 'object'
    ? (sourceValue as Record<string, unknown>).type
    : null
  const targetType = targetValue && typeof targetValue === 'object'
    ? (targetValue as Record<string, unknown>).type
    : null

  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(relationship.source_references) ? relationship.source_references : undefined,
    Array.isArray(relationship.evidence) ? relationship.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(relationship.chunk_positions) ? relationship.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...relationship,
    character_a: source,
    character_b: target,
    source_type: typeof sourceType === 'string' ? sourceType : null,
    target_type: typeof targetType === 'string' ? targetType : null,
    relationship_type: type,
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function canonicalEventToLegacy(event: Record<string, unknown>): Record<string, unknown> | null {
  const name = typeof event.name === 'string' ? event.name.trim() : ''
  const description = typeof event.description === 'string' ? event.description.trim() : ''
  if (!name && !description) return null

  const participants = Array.isArray(event.participants)
    ? event.participants.map(referenceName).filter(Boolean)
    : []
  const location = referenceName(event.location) || null
  const provenance = sourceReferencesToLegacyFields(
    Array.isArray(event.source_references) ? event.source_references : undefined,
    Array.isArray(event.evidence) ? event.evidence.filter((item): item is string => typeof item === 'string') : undefined,
    Array.isArray(event.chunk_positions) ? event.chunk_positions.filter((item): item is number => typeof item === 'number') : undefined,
  )

  return {
    ...event,
    name: name || description,
    description: description || name,
    participants,
    location,
    what_happened: description || name,
    evidence: provenance.evidence || [],
    chunk_positions: provenance.chunk_positions || [],
  }
}

function normalizeCanonicalPayload(record: Record<string, unknown>): Record<string, unknown[]> | null {
  if (!isCanonicalExtractionPayload(record)) return null

  const grouped: Record<string, unknown[]> = {}
  for (const entity of record.entities) {
    const legacy = canonicalEntityToLegacy(entity as unknown as Record<string, unknown>)
    if (!legacy) continue
    const type = String(legacy.type).toLowerCase().replace(/[\s-]+/g, '_')
    const bucket = normalizeExtractionType(type)
    if (bucket && bucket !== 'events' && bucket !== 'relationships') (grouped[bucket] ||= []).push(legacy)
  }

  const relationships = Array.isArray(record.relationships)
    ? record.relationships.map((item) => canonicalRelationshipToLegacy(item as unknown as Record<string, unknown>)).filter(Boolean)
    : []
  const events = Array.isArray(record.events)
    ? record.events.map((item) => canonicalEventToLegacy(item as unknown as Record<string, unknown>)).filter(Boolean)
    : []
  if (relationships.length > 0) grouped.relationships = relationships as unknown[]
  if (events.length > 0) grouped.events = events as unknown[]

  return Object.keys(grouped).length > 0 ? grouped : null
}

/**
 * Normalize the canonical schema_version=2 payload and legacy model payloads
 * into the persistence contract. Invalid items are retained for explicit
 * validation rather than silently discarded.
 */
export function normalizeExtractionPayload<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) {
    const grouped = normalizeGenericEntityList(payload)
    return Object.keys(grouped).length > 0 ? grouped as T : null
  }

  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const wrapperKeys = ['result', 'data', 'extraction', 'output', 'response', 'knowledge']

  for (const wrapperKey of wrapperKeys) {
    if (record[wrapperKey] && typeof record[wrapperKey] === 'object') {
      const wrapped = normalizeExtractionPayload<Record<string, unknown[]>>(record[wrapperKey])
      if (wrapped) return wrapped as T
    }
  }

  const canonical = normalizeCanonicalPayload(record)
  if (canonical) return canonical as T

  const aliases: Record<string, string[]> = {
    characters: ['characters', 'character', 'people', 'persons'],
    locations: ['locations', 'location', 'places', 'place'],
    objects: ['objects', 'object', 'items', 'artifacts'],
    abilities: ['abilities', 'ability', 'skills'],
    magic_abilities: ['magic_abilities', 'magicAbilities', 'magical_abilities'],
    organizations: ['organizations', 'organization', 'groups'],
    events: ['events', 'event'],
    relationships: ['relationships', 'relationship'],
  }
  const normalized: Record<string, unknown[]> = {}
  let recognized = false

  for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
    const sourceKey = sourceKeys.find((key) => key in record)
    if (!sourceKey) continue
    const value = record[sourceKey]
    normalized[targetKey] = Array.isArray(value) ? value : value == null ? [] : [value]
    recognized = true
  }

  const genericEntities = record.entities ?? record.entity_list ?? record.knowledge_entities
  if (Array.isArray(genericEntities)) {
    const grouped = normalizeGenericEntityList(genericEntities)
    mergeExtractionBuckets(normalized, grouped)
    recognized = recognized || Object.keys(grouped).length > 0
  } else if (genericEntities && typeof genericEntities === 'object') {
    const grouped = normalizeExtractionPayload<Record<string, unknown[]>>(genericEntities)
    if (grouped) {
      mergeExtractionBuckets(normalized, grouped)
      recognized = true
    }
  }

  return recognized ? normalized as T : null
}

export interface ExtractionPayloadValidationResult {
  valid: boolean;
  errors: string[];
  itemCount: number;
}

/** Validates the normalized extraction contract before any database writes. */
export function validateExtractionPayload(payload: unknown): ExtractionPayloadValidationResult {
  const errors: string[] = []
  let itemCount = 0
  if (!payload || typeof payload !== 'object') return { valid: false, errors: ['payload must be an object'], itemCount }

  const record = payload as Record<string, unknown>
  for (const bucket of ['characters', 'locations', 'objects', 'abilities', 'magic_abilities', 'organizations']) {
    const items = record[bucket]
    if (items == null) continue
    if (!Array.isArray(items)) {
      errors.push(`${bucket} must be an array`)
      continue
    }
    items.forEach((item, index) => {
      itemCount++
      const name = item && typeof item === 'object' ? (item as Record<string, unknown>).name : null
      if (typeof name !== 'string' || !name.trim()) errors.push(`${bucket}[${index}].name is required`)
    })
  }

  const relationships = record.relationships
  if (relationships != null) {
    if (!Array.isArray(relationships)) errors.push('relationships must be an array')
    else relationships.forEach((item, index) => {
      itemCount++
      const value = item as Record<string, unknown>
      const source = value.character_a
      const target = value.character_b
      const type = value.relationship_type
      if (typeof source !== 'string' || !source.trim()) errors.push(`relationships[${index}].source is required`)
      if (typeof target !== 'string' || !target.trim()) errors.push(`relationships[${index}].target is required`)
      if (typeof type !== 'string' || !type.trim()) errors.push(`relationships[${index}].type is required`)
    })
  }

  const events = record.events
  if (events != null) {
    if (!Array.isArray(events)) errors.push('events must be an array')
    else events.forEach((item, index) => {
      itemCount++
      const value = item as Record<string, unknown>
      const name = value.name
      const description = value.description ?? value.what_happened
      if ((typeof name !== 'string' || !name.trim()) && (typeof description !== 'string' || !description.trim())) {
        errors.push(`events[${index}].name or description is required`)
      }
    })
  }

  return { valid: errors.length === 0 && itemCount > 0, errors, itemCount }
}

/** Validates the same Main/Branch combinations accepted by the Edge Function. */
export function validateExtractionMode(request: ExtractionModeRequest): ExtractionValidationResult {
  const mode = request.extraction_mode;
  const hasBranchId = Boolean(request.target_branch_id);
  const useMain = mode === 'bootstrap' || (request.use_main === true && !mode);

  if (mode === 'bootstrap' && hasBranchId) {
    return { ok: false, error: "extraction_mode='bootstrap' cannot specify target_branch_id." };
  }
  if (mode === 'branch' && !hasBranchId) {
    return { ok: false, error: "extraction_mode='branch' requires target_branch_id." };
  }
  if (!mode) {
    if (useMain && hasBranchId) {
      return { ok: false, error: 'cannot specify both use_main=true and target_branch_id.' };
    }
    if (!useMain && !hasBranchId) {
      return { ok: false, error: 'must specify either use_main=true or target_branch_id.' };
    }
  }

  return {
    ok: true,
    mode: mode || (useMain ? 'bootstrap' : 'branch'),
    branchId: hasBranchId ? request.target_branch_id! : null,
  };
}

/**
 * Adapts serial Sub-base C output to the C normalizer contract.
 *
 * The generic serial schema may place character fields at the top level,
 * under attributes, or under a `fields` object. C persistence needs the
 * stable attributes.character_field_observations map so field provenance,
 * inference flags, and first/last names survive normalization.
 *
 * Relationships are also normalized here regardless of whether the top-level
 * payload is schema_version=2 (unified entities array) or the legacy bucketed
 * format: the sub-base-c-characters prompt asks the model for
 * source/target/type on relationships, but validateExtractionPayload only
 * accepts character_a/character_b/relationship_type. normalizeCanonicalPayload
 * performs that same rename, but only runs when the whole payload satisfies
 * isCanonicalExtractionPayload, so legacy-bucketed payloads (permitted for
 * this profile) would otherwise skip it and fail validation.
 */
export function adaptSubBaseCSerialExtraction(payload: unknown): Record<string, unknown[]> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const rawCharacters = Array.isArray(record.characters) ? record.characters : [];
  const characters = rawCharacters
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((candidate) => {
      let attributes = candidate.attributes && typeof candidate.attributes === 'object' && !Array.isArray(candidate.attributes)
        ? { ...(candidate.attributes as Record<string, unknown>) }
        : {};
      if (attributes.age === undefined && candidate.age !== undefined) attributes.age = candidate.age;
      let observations = attributes.character_field_observations && typeof attributes.character_field_observations === 'object'
        ? { ...(attributes.character_field_observations as Record<string, unknown>) }
        : candidate.field_observations && typeof candidate.field_observations === 'object'
          ? { ...(candidate.field_observations as Record<string, unknown>) }
          : {};
      const fields = candidate.fields && typeof candidate.fields === 'object' && !Array.isArray(candidate.fields)
        ? candidate.fields as Record<string, unknown>
        : {};

      for (const [field, rawValue] of Object.entries(fields)) {
        if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && 'value' in rawValue) {
          const observation = rawValue as Record<string, unknown>;
          attributes[field] = observation.value;
          observations[field] = [observation];
        } else if (rawValue !== null && rawValue !== undefined) {
          attributes[field] = rawValue;
        }
      }

      // Recover recognized character fields that a flat/legacy payload placed as
      // siblings of `name` rather than inside `attributes`.
      for (const key of CHARACTER_FIELD_KEYS) {
        if (C_NON_FLAT_FIELD_KEYS.has(key)) continue;
        if (attributes[key] == null && isLiftableFlatValue(candidate[key])) {
          attributes[key] = candidate[key];
        }
      }

      // Map compatibility key spellings onto their canonical field keys.
      for (const [fromKey, toKey] of Object.entries(C_COMPAT_FIELD_ALIASES)) {
        if (attributes[fromKey] == null && isLiftableFlatValue(candidate[fromKey])) {
          attributes[fromKey] = candidate[fromKey];
        }
        if (attributes[fromKey] != null && attributes[toKey] == null) {
          attributes[toKey] = attributes[fromKey];
        }
        if (attributes[fromKey] != null) delete attributes[fromKey];
        if (observations[fromKey] && !observations[toKey]) observations[toKey] = observations[fromKey];
        if (observations[fromKey]) delete observations[fromKey];
      }

      // Fill value-less observation entries when a field value is available.
      for (const [field, rawObs] of Object.entries(observations)) {
        if (!Array.isArray(rawObs) || attributes[field] == null) continue;
        observations[field] = rawObs.map((entry) => {
          if (
            entry && typeof entry === 'object' && !Array.isArray(entry)
            && (!('value' in entry) || (entry as Record<string, unknown>).value == null)
          ) {
            return { ...(entry as Record<string, unknown>), value: attributes[field] };
          }
          return entry;
        });
      }

      attributes.character_field_observations = observations;
      attributes = normalizeSubBaseCCharacterAttributes(attributes);
      observations = normalizeCharacterAgeObservationMap(attributes.character_field_observations);

      const candidateFirstName = typeof candidate.first_name === 'string' ? candidate.first_name.trim() : '';
      const candidateLastName = typeof candidate.last_name === 'string' ? candidate.last_name.trim() : '';
      if (candidateFirstName && attributes.first_name == null) attributes.first_name = candidateFirstName;
      if (candidateLastName && attributes.last_name == null) attributes.last_name = candidateLastName;

      const fieldEvidence = candidate.field_evidence && typeof candidate.field_evidence === 'object' && !Array.isArray(candidate.field_evidence)
        ? candidate.field_evidence as Record<string, unknown>
        : {};
      for (const [field, rawEvidence] of Object.entries(fieldEvidence)) {
        if (observations[field] || attributes[field] == null || !Array.isArray(rawEvidence)) continue;
        const evidence = rawEvidence
          .filter((quote): quote is string => typeof quote === 'string' && quote.trim().length > 0)
          .map((quote) => ({ quote }));
        if (evidence.length > 0) {
          observations[field] = [{
            value: attributes[field],
            evidence,
            confidence: null,
            inferred: false,
            inference_note: null,
          }];
        }
      }

      attributes.character_field_observations = observations;
      const firstName = typeof attributes.first_name === 'string' ? attributes.first_name.trim() : '';
      const lastName = typeof attributes.last_name === 'string' ? attributes.last_name.trim() : '';
      const name = typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : [firstName, lastName].filter(Boolean).join(' ');

      return {
        ...candidate,
        name,
        type: 'character',
        attributes,
      };
    });

  const rawRelationships = Array.isArray(record.relationships) ? record.relationships : [];
  const relationships = rawRelationships
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const relationship = item as Record<string, unknown>;
      const legacy = canonicalRelationshipToLegacy(relationship);
      // A relationship missing source/target/type is left untouched so the
      // shared validator can reject it explicitly.
      if (!legacy) return relationship;
      const normalizedType = String(legacy.relationship_type ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
      if (!(CHARACTER_RELATIONSHIP_TYPES as readonly string[]).includes(normalizedType)) {
        // Not a Sub-base C character relationship type: drop it rather than
        // persist a hallucinated edge type.
        return null;
      }
      legacy.relationship_type = normalizedType;
      return legacy;
    })
    .filter((item) => item !== null) as unknown[];

  return { ...record, characters, ...(rawRelationships.length > 0 ? { relationships } : {}) };
}

// ============================================================
// Phase 2: Sub-base C persistence helpers (pure, testable)
// ============================================================

/**
 * Returns the entity-id pair to store for a character relationship. For a
 * symmetric relationship type the pair is sorted deterministically so that an
 * A->B edge and a B->A edge collapse onto the same
 * (source_entity_id, target_entity_id, relationship_type) conflict key.
 * Directional relationship types are returned unchanged.
 */
export function orderRelationshipEndpointsForPersistence(
  sourceId: string,
  targetId: string,
  relationshipType: string,
): [string, string] {
  if (!isSymmetricCharacterRelationship(relationshipType)) return [sourceId, targetId];
  return sourceId <= targetId ? [sourceId, targetId] : [targetId, sourceId];
}

/**
 * Builds a diagnostic message when a relationship cannot be persisted because
 * one or both endpoints did not resolve to a persisted entity. Returns null
 * when both endpoints resolved.
 */
export function describeUnresolvedRelationship(
  relationshipType: string,
  sourceName: string,
  targetName: string,
  sourceResolved: boolean,
  targetResolved: boolean,
): string | null {
  if (sourceResolved && targetResolved) return null;
  const parts: string[] = [];
  if (!sourceResolved) parts.push(`source '${sourceName || "(missing)"}'`);
  if (!targetResolved) parts.push(`target '${targetName || "(missing)"}'`);
  return `Dropped relationship '${relationshipType}': unresolved ${parts.join(" and ")}`;
}

/**
 * Returns a copy of `merged` in which every field key that the user has
 * explicitly edited (an active user-owned knowledge_entity_values row) is taken
 * from the existing persisted value instead of the incoming AI value. Keys the
 * user has not touched are left as the extraction merge produced them.
 */
export function withUserOwnedStructuredFields(
  merged: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
  userOwnedFieldPaths: Iterable<string>,
): Record<string, unknown> {
  const result = { ...merged };
  const existingFields = existing || {};
  for (const path of userOwnedFieldPaths) {
    if (Object.prototype.hasOwnProperty.call(existingFields, path)) {
      result[path] = existingFields[path];
    } else {
      delete result[path];
    }
  }
  return result;
}

/**
 * The overlay override / base-value keys that `buildOverlayChanges` can emit for
 * one user-owned entity `field_path`. The descriptive `name` and `description`
 * field_paths map onto the `canonical_name` / `description` overlay keys; every
 * other field_path can surface as both a `structured_fields.<key>` and an
 * `attributes.<key>` change.
 */
export function overlayFieldPathsForUserOwned(fieldPath: string): string[] {
  if (fieldPath === "name") return ["canonical_name"];
  if (fieldPath === "description") return ["description"];
  return [`structured_fields.${fieldPath}`, `attributes.${fieldPath}`];
}

/**
 * Removes, in place, every overlay `overrides` / `baseValues` entry that a later
 * Branch extraction must not re-assert because the user owns the corresponding
 * field_path (an active user-authored knowledge_entity_values row on this Branch
 * or on Main). The prior user override already stored in the overlay is kept.
 */
export function stripUserOwnedOverlayEntries(
  overrides: Record<string, unknown>,
  baseValues: Record<string, unknown>,
  userOwnedFieldPaths: Iterable<string>,
): void {
  for (const fieldPath of userOwnedFieldPaths) {
    for (const key of overlayFieldPathsForUserOwned(fieldPath)) {
      delete overrides[key];
      delete baseValues[key];
    }
  }
}

/**
 * The `canonical_name` / `description` column values to persist on a
 * re-extraction, honouring user-owned `name` / `description` provenance: a field
 * the user owns keeps its existing persisted value, otherwise the merged AI
 * value wins. Callers compose this with any coarser row-level guard (e.g. a
 * fully user-sourced Main row).
 */
export function gateUserOwnedNameAndDescription(
  merged: { canonical_name?: unknown; description?: unknown },
  existing: { canonical_name?: unknown; description?: unknown },
  userOwned: Set<string>,
): { canonical_name: unknown; description: unknown } {
  return {
    canonical_name: userOwned.has("name") ? existing.canonical_name : merged.canonical_name,
    description: userOwned.has("description") ? existing.description : merged.description,
  };
}

/**
 * Whether `findExistingMainEntity` should run its fuzzy Main-character identity
 * fallback (project-wide alias/prefix resolution) after an exact canonical_name
 * lookup misses. Only the Sub-base C profile composes canonical_name from
 * first+last name, so only its `character` entities need it.
 */
export function shouldUseMainCharacterFallback(
  modelProfile: string | undefined,
  entityType: string,
): boolean {
  return modelProfile === "sub-base-c-characters" && entityType === "character";
}

export interface CharacterRelationshipWritePlan {
  action: "persist" | "drop" | "skip_self";
  diagnostic: string | null;
  source_entity_id?: string;
  target_entity_id?: string;
}

/**
 * Decides how one extracted character relationship should be persisted, given
 * its resolved endpoint ids. Pure so the persistence loop's three inline
 * decisions (unresolved -> drop + diagnostic, self-edge -> skip, otherwise ->
 * one canonical ordered pair) can be tested without the Edge handler.
 *
 * The returned `source_entity_id` / `target_entity_id` are the single pair the
 * caller must use for BOTH the existing-row probe and the upsert.
 */
export function planCharacterRelationshipWrite(input: {
  relationshipType: string;
  sourceName: string;
  targetName: string;
  sourceId: string | null;
  targetId: string | null;
  modelProfile: string;
}): CharacterRelationshipWritePlan {
  const { relationshipType, sourceName, targetName, sourceId, targetId, modelProfile } = input;

  const diagnostic = describeUnresolvedRelationship(
    relationshipType,
    sourceName,
    targetName,
    Boolean(sourceId),
    Boolean(targetId),
  );
  if (diagnostic) return { action: "drop", diagnostic };
  if (sourceId === targetId) return { action: "skip_self", diagnostic: null };

  const [source_entity_id, target_entity_id] = modelProfile === "sub-base-c-characters"
    ? orderRelationshipEndpointsForPersistence(sourceId!, targetId!, relationshipType)
    : [sourceId!, targetId!];
  return { action: "persist", diagnostic: null, source_entity_id, target_entity_id };
}
