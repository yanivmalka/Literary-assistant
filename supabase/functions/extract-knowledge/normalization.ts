import { normalizeKey, stripNikud } from "../_shared/rules/normalization.ts";
import { shouldFilterEntity } from "../_shared/rules/filtering.ts";
import { isPrefixMatch, CONSOLIDATION_THRESHOLDS } from "../_shared/rules/consolidation.ts";
import {
  hasConflictingEntityContext,
  type EntityResolutionRecord,
} from "../_shared/entity-resolution.ts";
import type { ExtractionNameUncertainty, ExtractionSourceReference } from "../_shared/extraction-contract.ts";
import { getEmbeddedAbilityReferences } from "../_shared/ability-links.ts";

export interface ExtractedEntity {
  name: string;
  type?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  relationships?: string[];
  abilities?: string[];
  description?: string;
  significance?: string;
  evidence?: string[];
  chunk_positions?: number[];
  users?: string[];
  members?: string[];
  purpose?: string | null;
  field_evidence?: Record<string, string[]>;
  age?: string | null;
  gender?: string | null;
  height?: string | null;
  hair_color?: string | null;
  eye_color?: string | null;
  face_structure?: string | null;
  common_clothing?: string | null;
  scars?: string | null;
  tattoos?: string | null;
  narrative_role?: string | null;
  location_type?: string | null;
  place_type?: string | null;
  location_fields?: Record<string, unknown> | null;
  container_places?: Array<{ name: string; type?: string }> | string[] | null;
  parent_location?: string | null;
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  narrative_importance?: string | null;
  related_characters?: string | null;
  object_type?: string | null;
  appearance?: string | null;
  materials?: string | null;
  special_properties?: string | null;
  origin?: string | null;
  current_location?: string | null;
  owners?: string | null;
  ability_type?: string | null;
  mechanism?: string | null;
  activation_conditions?: string | null;
  limitations?: string | null;
  cost?: string | null;
  power_level?: string | null;
  magic_system?: string | null;
  source?: string | null;
  name_uncertainty?: ExtractionNameUncertainty | null;
  source_references?: ExtractionSourceReference[];
}

export interface ExtractedEvent {
  description?: string;
  name?: string;
  participants?: string[];
  location?: string | null;
  what_happened?: string;
  evidence?: string[];
  chunk_positions?: number[];
}

export interface ExtractedRelationship {
  character_a: string;
  character_b: string;
  relationship_type: string;
  evidence?: string[];
  chunk_positions?: number[];
}

export interface GeminiExtraction {
  characters?: ExtractedEntity[];
  locations?: ExtractedEntity[];
  objects?: ExtractedEntity[];
  abilities?: ExtractedEntity[];
  magic_abilities?: ExtractedEntity[];
  organizations?: ExtractedEntity[];
  events?: ExtractedEvent[];
  relationships?: ExtractedRelationship[];
}

export interface NormalizedEntity {
  canonical_name: string;
  entity_type: string;
  entity_types: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  structured_fields: Record<string, unknown>;
  aliases: string[];
  evidence: string[];
  chunk_positions: number[];
  chunk_ids?: string[];
  page_numbers?: number[];
  field_evidence?: Record<string, string[]>;
  field_confidence?: Record<string, number>;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean)
  }
  return []
}

/** Builds the structured fields used by persistence from one extracted entity. */
export function buildStructuredFields(type: string, entity: ExtractedEntity): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  fields.name = entity.name ? stripNikud(entity.name) : null;
  fields.description = entity.description || entity.significance || null;

  if (type === "character") {
    fields.age = entity.age || null;
    fields.gender = entity.gender || null;
    fields.height = entity.height || null;
    fields.hair_color = entity.hair_color || null;
    fields.eye_color = entity.eye_color || null;
    fields.face_structure = entity.face_structure || null;
    fields.cheekbones = null;
    fields.eye_shape = null;
    fields.forehead = null;
    fields.nose = null;
    fields.beard_mustache = null;
    fields.common_clothing = entity.common_clothing || null;
    fields.jewelry = null;
    fields.scars = entity.scars || null;
    fields.tattoos = entity.tattoos || null;
    fields.other_visual_features = null;
    fields.narrative_role = entity.narrative_role || null;
    fields.narrative_impact = null;
  } else if (type === "location") {
    const entityAttributes = entity.attributes || {};
    const locationFields = entity.location_fields || (entityAttributes.location_fields as Record<string, unknown> | undefined) || {};
    const placeType = entity.place_type || entity.location_type || (entityAttributes.place_type as string | undefined) || "other";
    fields.place_type = placeType;
    fields.location_type = placeType;
    fields.description = entity.description || entity.significance || null;
    for (const [key, value] of Object.entries(locationFields)) {
      if (key && value !== undefined) fields[key] = value;
    }
    for (const key of ["continent", "country", "region", "city"] as const) {
      if (entity[key] !== undefined) fields[key] = entity[key];
    }
    // Keep legacy parent_location as a compatibility hint; containment is
    // persisted from explicit relationships, never inferred from this field.
    if (entity.parent_location) fields.parent_location = entity.parent_location;
    fields.narrative_importance = entity.narrative_importance || null;
    fields.narrative_impact = null;
  } else if (type === "object") {
    fields.object_type = entity.object_type || null;
    fields.appearance = entity.appearance || null;
    fields.materials = entity.materials || null;
    fields.special_properties = entity.special_properties || null;
    fields.origin = entity.origin || null;
    fields.current_location = entity.current_location || null;
    fields.owners = entity.owners || null;
    fields.narrative_importance = entity.narrative_importance || null;
    fields.narrative_impact = null;
    fields.related_characters = entity.related_characters || null;
    fields.related_events = null;
  } else if (type === "ability" || type === "magic_ability") {
    fields.ability_type = entity.ability_type || (type === "magic_ability" ? "magical" : "physical");
    fields.mechanism = entity.mechanism || null;
    fields.activation_conditions = entity.activation_conditions || null;
    fields.limitations = entity.limitations || null;
    fields.cost = entity.cost || null;
    fields.power_level = entity.power_level || null;
    fields.magic_system = entity.magic_system || null;
    const users = normalizeStringList(entity.users)
    fields.users = users.length > 0 ? users.join(", ") : null;
    fields.narrative_impact = null;
    fields.related_events = null;
  }
  if (type === "organization") {
    fields.users = entity.members ? entity.members.join(", ") : null;
  }

  return fields;
}

function computeFieldConfidence(
  fieldEvidence: Record<string, string[]>,
  structuredFields: Record<string, unknown>,
): Record<string, number> {
  const confidence: Record<string, number> = {};
  for (const fieldName of Object.keys(structuredFields)) {
    const hasEvidence = fieldEvidence[fieldName] && fieldEvidence[fieldName].length > 0;
    const value = structuredFields[fieldName];
    if (!hasEvidence || value === null || value === undefined) {
      confidence[fieldName] = 0.5;
    } else {
      confidence[fieldName] = Math.min(0.95, 0.7 + (fieldEvidence[fieldName] || []).length * 0.1);
    }
  }
  return confidence;
}

function buildExtractionMetadata(entity: ExtractedEntity): Record<string, unknown> | null {
  if (!entity.name_uncertainty && !entity.source_references) return null;
  return {
    schema_version: "2",
    name_uncertainty: entity.name_uncertainty || null,
    source_references: entity.source_references || [],
  };
}

/**
 * Normalizes the exact Gemini extraction contract used by extract-knowledge.
 * It is pure: chunk metadata is supplied by the caller and no database client is used.
 */
export function normalizeEntities(
  extraction: GeminiExtraction,
  chunkLookup: Map<number, { id: string; page: number | null }>,
): NormalizedEntity[] {
  const entityMap = new Map<string, NormalizedEntity>();

  function addEntity(name: string, type: string, entity: ExtractedEntity) {
    if (!name || !name.trim()) return;
    const cleanName = stripNikud(name.trim());
    const key = normalizeKey(cleanName);
    if (!key) return;

    const incomingStructuredFields = buildStructuredFields(type, entity);
    const incomingContext: EntityResolutionRecord = {
      canonical_name: cleanName,
      entity_type: type,
      description: entity.description || entity.significance || null,
      attributes: entity.attributes || {},
      structured_fields: incomingStructuredFields,
    };

    let entityMapKey = key;
    let existing = entityMap.get(entityMapKey);
    let suffix = 2;
    while (existing && hasConflictingEntityContext(existing, incomingContext)) {
      entityMapKey = `${key}::${suffix}`;
      existing = entityMap.get(entityMapKey);
      suffix++;
    }

    if (existing) {
      if (!existing.entity_types.includes(type)) existing.entity_types.push(type);
      if (entity.attributes) existing.attributes = { ...existing.attributes, ...entity.attributes };
      const extractionMetadata = buildExtractionMetadata(entity);
      if (extractionMetadata) {
        existing.attributes.extraction_meta = {
          ...((existing.attributes.extraction_meta as Record<string, unknown> | undefined) || {}),
          ...extractionMetadata,
        };
      }
      if (entity.evidence) {
        for (const evidence of entity.evidence) {
          if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
        }
      }
      if (entity.chunk_positions) {
        for (const position of entity.chunk_positions) {
          if (!existing.chunk_positions.includes(position)) existing.chunk_positions.push(position);
        }
      }
      if (entity.aliases) {
        for (const alias of entity.aliases) {
          if (alias && !existing.aliases.includes(stripNikud(alias))) existing.aliases.push(stripNikud(alias));
        }
      }
      if (cleanName.length > existing.canonical_name.length) {
        if (!existing.aliases.includes(existing.canonical_name)) existing.aliases.push(existing.canonical_name);
        existing.canonical_name = cleanName;
      } else if (cleanName !== existing.canonical_name && !existing.aliases.includes(cleanName)) {
        existing.aliases.push(cleanName);
      }
      if (entity.description && !existing.description) existing.description = entity.description;
      if (entity.significance && !existing.description) existing.description = entity.significance;
      if (entity.relationships && entity.relationships.length > 0) {
        existing.attributes.relationships = [...((existing.attributes.relationships as string[]) || []), ...entity.relationships];
      }
      const entityUsers = normalizeStringList(entity.users)
      if (entityUsers.length > 0) {
        existing.attributes.users = [...new Set([
          ...normalizeStringList(existing.attributes.users),
          ...entityUsers,
        ])]
      }
      if (entity.members && entity.members.length > 0) {
        existing.attributes.members = [...((existing.attributes.members as string[]) || []), ...entity.members];
      }
      if (entity.purpose) existing.attributes.purpose = entity.purpose;
      for (const [field, value] of Object.entries(incomingStructuredFields)) {
        if (value != null && existing.structured_fields[field] == null) existing.structured_fields[field] = value;
      }
    } else {
      const attributes: Record<string, unknown> = { ...(entity.attributes || {}) };
      const extractionMetadata = buildExtractionMetadata(entity);
      if (extractionMetadata) attributes.extraction_meta = extractionMetadata;
      if (entity.abilities && entity.abilities.length > 0) attributes.abilities = entity.abilities;
      if (entity.relationships && entity.relationships.length > 0) attributes.relationships = entity.relationships;
      const entityUsers = normalizeStringList(entity.users)
      if (entityUsers.length > 0) attributes.users = entityUsers;
      if (entity.members && entity.members.length > 0) attributes.members = entity.members;
      if (entity.purpose) attributes.purpose = entity.purpose;

      const chunkIds: string[] = [];
      const pageNumbers: number[] = [];
      for (const position of entity.chunk_positions || []) {
        const chunkInfo = chunkLookup.get(position);
        if (chunkInfo?.id) chunkIds.push(chunkInfo.id);
        if (chunkInfo?.page != null) pageNumbers.push(chunkInfo.page);
      }

      entityMap.set(entityMapKey, {
        canonical_name: cleanName,
        entity_type: type,
        entity_types: [type],
        description: entity.description || entity.significance || null,
        attributes,
        structured_fields: incomingStructuredFields,
        aliases: (entity.aliases || []).map((alias) => stripNikud(alias)).filter(Boolean),
        evidence: entity.evidence || [],
        chunk_positions: entity.chunk_positions || [],
        chunk_ids: chunkIds.length > 0 ? chunkIds : undefined,
        page_numbers: pageNumbers.length > 0 ? pageNumbers : undefined,
        field_evidence: entity.field_evidence,
        field_confidence: entity.field_evidence
          ? computeFieldConfidence(entity.field_evidence, incomingStructuredFields)
          : undefined,
      });
    }
  }

  const physicalAbilities = [...(extraction.abilities || [])]
  const magicAbilities = [...(extraction.magic_abilities || [])]

  // Backward compatibility: promote skills embedded on characters to first-class
  // entities so the UI can display them and the persistence layer can link them.
  for (const character of extraction.characters || []) {
    const characterAttributes = character.attributes || {}
    for (const reference of getEmbeddedAbilityReferences({
      ...characterAttributes,
      abilities: character.abilities ?? characterAttributes.abilities,
      magic_abilities: characterAttributes.magic_abilities,
      life_skills: characterAttributes.life_skills,
      skills: characterAttributes.skills,
      magic_skills: characterAttributes.magic_skills,
    })) {
      const target = reference.entityType === "magic_ability" ? magicAbilities : physicalAbilities
      const existing = target.find((ability) => normalizeKey(ability.name) === normalizeKey(reference.name))
      if (existing) {
        existing.users = [...new Set([
          ...normalizeStringList(existing.users),
          character.name,
        ])]
      } else {
        target.push({
          name: reference.name,
          users: [character.name],
          chunk_positions: character.chunk_positions || [],
          evidence: character.evidence || [],
        })
      }
    }
  }

  for (const character of extraction.characters || []) addEntity(character.name, "character", character);
  for (const location of extraction.locations || []) addEntity(location.name, "location", location);
  for (const object of extraction.objects || []) addEntity(object.name, "object", object);
  for (const ability of physicalAbilities) addEntity(ability.name, "ability", ability);
  for (const magicAbility of magicAbilities) addEntity(magicAbility.name, "magic_ability", magicAbility);
  for (const organization of extraction.organizations || []) addEntity(organization.name, "organization", organization);

  const entries = Array.from(entityMap.entries());
  const consolidationCandidates: Array<{ keyA: string; keyB: string; score: number }> = [];

  for (let i = 0; i < entries.length; i++) {
    const [keyA, entityA] = entries[i];
    if (!entityMap.has(keyA)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const [keyB, entityB] = entries[j];
      if (!entityMap.has(keyB)) continue;
      if (entityA.entity_type !== entityB.entity_type) continue;
      if (normalizeKey(entityA.canonical_name) === normalizeKey(entityB.canonical_name) && hasConflictingEntityContext(entityA, entityB)) continue;

      let score = 0;
      if (isPrefixMatch(entityA.canonical_name, entityB.canonical_name) || isPrefixMatch(entityB.canonical_name, entityA.canonical_name)) {
        score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES["prefix_match"];
      }
      const commonChunks = entityA.chunk_positions.filter((position) => entityB.chunk_positions.includes(position));
      if (commonChunks.length > 0) score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES.co_location;
      if (entityA.description && entityB.description && entityA.description === entityB.description) {
        score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES.matching_description;
      }
      const relationshipsA = (entityA.attributes.relationships as string[]) || [];
      const relationshipsB = (entityB.attributes.relationships as string[]) || [];
      if (relationshipsA.some((relationship) => relationshipsB.includes(relationship))) {
        score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES.matching_relationships;
      }
      if (score >= CONSOLIDATION_THRESHOLDS.SUGGEST_CONSOLIDATION_THRESHOLD) {
        consolidationCandidates.push({ keyA, keyB, score });
      }
    }
  }

  for (const { keyA, keyB, score } of consolidationCandidates.sort((a, b) => b.score - a.score)) {
    const entityA = entityMap.get(keyA);
    const entityB = entityMap.get(keyB);
    if (!entityA || !entityB || score < CONSOLIDATION_THRESHOLDS.AUTO_CONSOLIDATE_THRESHOLD) continue;

    const [keepKey, keep, removeKey, remove] = entityA.canonical_name.length >= entityB.canonical_name.length
      ? [keyA, entityA, keyB, entityB]
      : [keyB, entityB, keyA, entityA];
    if (!keep.aliases.includes(remove.canonical_name)) keep.aliases.push(remove.canonical_name);
    for (const alias of remove.aliases) {
      if (alias && !keep.aliases.includes(alias) && alias !== keep.canonical_name) keep.aliases.push(alias);
    }
    for (const evidence of remove.evidence) if (!keep.evidence.includes(evidence)) keep.evidence.push(evidence);
    for (const position of remove.chunk_positions) if (!keep.chunk_positions.includes(position)) keep.chunk_positions.push(position);
    if (!keep.description && remove.description) keep.description = remove.description;
    for (const [field, value] of Object.entries(remove.structured_fields)) {
      if (value != null && keep.structured_fields[field] == null) keep.structured_fields[field] = value;
    }
    for (const [field, value] of Object.entries(remove.attributes)) {
      if (value != null && keep.attributes[field] == null) keep.attributes[field] = value;
    }
    entityMap.delete(removeKey);
    void keepKey;
  }

  return [...entityMap.values()].filter((entity) => !shouldFilterEntity(entity));
}
