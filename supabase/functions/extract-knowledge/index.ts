// ============================================
// Edge Function: extract-knowledge
// Production version: Extracts entities from document chunks via Gemini (with multi-model fallback).
// Fetches chunks internally from DB (like the old Express route).
// Normalizes and saves to knowledge layer tables.
// Idempotent via UNIQUE constraints (upsert).
// Uses service_role key to bypass RLS.
//
// Domain rules are imported from _shared/rules/ — the single source of truth
// for entity extraction behavior. See rules/index.ts for architecture docs.
//
// VERSION: 2.4.0
// FILTERS ACTIVE:
//   - CHARACTER_RULES.blockPatterns: v2 (family roles + generic descriptors)
//   - CHARACTER_RULES.minNameLength: 2
//   - LOCATION_RULES.blockWords: comprehensive generic terms
//   - Consolidation: EVIDENCE-BASED (prefix match + co-location + description match)
//     - Score >= 70: suggest consolidation (preview UI)
//     - Score >= 100: auto-consolidate (requires explicit user action for lower)
//   - NO magic_systems extraction
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiWithFallback, getGeminiResponseText } from "../_shared/gemini-client.ts";
import { assertQuillsAvailable, consumeGeminiUsage } from "../_shared/quills.ts";
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_PROFILE,
  GEMINI_MODEL_PROFILES,
  isGeminiModelProfile,
  type GeminiModelProfile,
} from "../_shared/gemini-config.ts";
import { buildExtractionPromptForProfile } from "../_shared/rules/prompt.ts";
import { normalizeKey, stripNikud } from "../_shared/rules/normalization.ts";
import { shouldFilterEntity } from "../_shared/rules/filtering.ts";
import { isPrefixMatch, scoreConsolidation, CONSOLIDATION_THRESHOLDS } from "../_shared/rules/consolidation.ts";
import { syncEntityValues } from "../_shared/value-sync.ts";
import {
  applyEntityOverrides,
  hasConflictingEntityContext,
  resolveExtractionCandidate,
  type EntityResolutionRecord,
} from "../_shared/entity-resolution.ts";
import { normalizeEntities as normalizeEntitiesForExtraction } from "./normalization.ts";
import {
  DEFAULT_EXTRACTION_STRATEGY,
  parseExtractionJson,
  cloneJsonValue,
  normalizeExtractionPayload,
  validateExtractionMode,
  validateExtractionPayload,
  validateExtractionStrategy,
  isParallelExpertsRolloutEnabled,
  validateExtractionStrategyRollout,
  PARALLEL_EXPERTS_ROLLOUT_ENV,
  type ExtractionStrategy,
} from "./testable-pipeline.ts";
import type { ExtractionSourceReference, ExtractionNameUncertainty } from "../_shared/extraction-contract.ts";
import { buildAbilityLinks, mergeAbilityLinkEntries } from "../_shared/ability-links.ts";
import type { AbilityLinkEntity } from "../_shared/ability-links.ts";
import { buildSkippedBatchResponse, getExtractionSkipReason } from "./skip-policy.ts";
import { executeParallelExpertExtraction } from "../_shared/parallel-expert-merger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// ============================================
// Types
// ============================================

interface ExtractRequest {
  version_id: string;
  document_id: string;
  project_id: string;
  user_id: string;
  offset?: number;
  limit?: number;
  target_branch_id?: string | null;
  use_main?: boolean;
  // CRITICAL FIX: Extraction-level context instead of per-batch decisions
  extraction_mode?: 'bootstrap' | 'branch';
  extraction_run_id?: string;
  /** Server-side allowlisted model profile, fixed for every batch in a run. */
  model_profile?: GeminiModelProfile;
  /** Run-level extraction strategy, fixed for every batch in a run. */
  extraction_strategy?: unknown;
  /** Allow only sub-base-locations to continue after a classified Gemini batch failure. */
  skip_per_batch?: boolean;
}

interface ExtractedEntity {
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
  character_fields?: Record<string, unknown> | null;
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

interface ExtractedEvent {
  description?: string;
  name?: string;
  participants?: string[];
  location?: string | null;
  what_happened?: string;
  evidence?: string[];
  chunk_positions?: number[];
  uncertainty?: number | null;
  source_references?: ExtractionSourceReference[];
}

interface ExtractedRelationship {
  character_a: string;
  character_b: string;
  relationship_type: string;
  description?: string | null;
  source_type?: string | null;
  target_type?: string | null;
  uncertainty?: number | null;
  evidence?: string[];
  source_references?: ExtractionSourceReference[];
  chunk_positions?: number[];
}

interface GeminiExtraction {
  characters?: ExtractedEntity[];
  locations?: ExtractedEntity[];
  objects?: ExtractedEntity[];
  abilities?: ExtractedEntity[];
  magic_abilities?: ExtractedEntity[];
  organizations?: ExtractedEntity[];
  events?: ExtractedEvent[];
  relationships?: ExtractedRelationship[];
}

function normalizeRelationshipType(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 100);
  return normalized || null;
}

function normalizeRelationshipLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function mergeRelationshipLabelsIntoAttributes(attributes: Record<string, unknown>, labels: string[]): void {
  if (labels.length === 0) return;
  const current = attributes.relationships;
  if (current == null || Array.isArray(current) || typeof current === "string") {
    attributes.relationships = [...new Set([
      ...normalizeRelationshipLabels(current),
      ...labels,
    ])];
    return;
  }
  attributes.relationship_labels = [...new Set([
    ...normalizeRelationshipLabels(attributes.relationship_labels),
    ...labels,
  ])];
}

// ============================================
// Prompt — delegates to centralized rules
// ============================================

function buildPrompt(
  chunks: { position: number; content: string }[],
  profile: GeminiModelProfile,
  customPlaceFields: Array<{ place_type_key: string; field_key: string; label: string }> = [],
  dynamicCharacterFields: Array<{ field_key: string; label: string; group_key: string }> = [],
): string {
  return buildExtractionPromptForProfile(chunks, profile, dynamicCharacterFields, customPlaceFields);
}

// ============================================
// Normalization — uses centralized rules
// ============================================

interface NormalizedEntity {
  canonical_name: string;
  entity_type: string;
  entity_types: string[];
  description: string | null;
  attributes: Record<string, unknown>;
  structured_fields: Record<string, unknown>;
  aliases: string[];
  evidence: string[];
  chunk_positions: number[];
  // NEW: Provenance tracking for mentions
  chunk_ids?: string[];        // UUIDs of document_chunks
  page_numbers?: number[];     // Page numbers from chunks
  // NEW: Field-specific evidence and confidence
  field_evidence?: Record<string, string[]>;
  field_confidence?: Record<string, number>;
}

/** Build structured_fields from the entity's flat fields based on its type */
function buildStructuredFields(type: string, entity: ExtractedEntity): Record<string, unknown> {
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
    if (entity.parent_location) fields.parent_location = entity.parent_location;
    fields.narrative_impact = null;
    fields.narrative_importance = entity.narrative_importance || null;
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
    fields.users = entity.users ? entity.users.join(", ") : null;
    fields.narrative_impact = null;
    fields.related_events = null;
  }
  if (type === "organization") {
    fields.users = entity.members ? entity.members.join(", ") : null;
  }

  return fields;
}

/**
 * Compute confidence for each field based on whether field-specific evidence exists.
 * Fields WITH evidence get higher confidence than fields WITHOUT.
 */
function computeFieldConfidence(
  fieldEvidence: Record<string, string[]>,
  structuredFields: Record<string, unknown>
): Record<string, number> {
  const confidence: Record<string, number> = {};

  for (const fieldName of Object.keys(structuredFields)) {
    const hasEvidence = fieldEvidence[fieldName] && fieldEvidence[fieldName].length > 0;
    const value = structuredFields[fieldName];

    if (!hasEvidence || value === null || value === undefined) {
      // No evidence or no value = low confidence
      confidence[fieldName] = 0.5;
    } else {
      // Has evidence = higher confidence
      const evidenceCount = (fieldEvidence[fieldName] || []).length;
      confidence[fieldName] = Math.min(0.95, 0.7 + evidenceCount * 0.1);
    }
  }

  return confidence;
}

function normalizeEntities(
  extraction: GeminiExtraction, 
  chunkLookup: Map<number, { id: string; page: number | null }>
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
      if (entity.evidence) {
        for (const e of entity.evidence) {
          if (!existing.evidence.includes(e)) existing.evidence.push(e);
        }
      }
      if (entity.chunk_positions) {
        for (const p of entity.chunk_positions) {
          if (!existing.chunk_positions.includes(p)) existing.chunk_positions.push(p);
        }
      }
      if (entity.aliases) {
        for (const a of entity.aliases) {
          if (a && !existing.aliases.includes(stripNikud(a))) existing.aliases.push(stripNikud(a));
        }
      }
      // Prefer longer name as canonical
      if (cleanName.length > existing.canonical_name.length) {
        if (!existing.aliases.includes(existing.canonical_name)) {
          existing.aliases.push(existing.canonical_name);
        }
        existing.canonical_name = cleanName;
      } else if (cleanName !== existing.canonical_name && !existing.aliases.includes(cleanName)) {
        existing.aliases.push(cleanName);
      }
      if (entity.description && !existing.description) existing.description = entity.description;
      if (entity.significance && !existing.description) existing.description = entity.significance;
      // NOTE: Abilities are now extracted as separate entities (see below at line ~352).
      // They should NOT be stored in character.attributes.abilities.
      // Instead, create relationship records linking character → ability after normalization.
      // This preserves the line for backwards compatibility but does not accumulate abilities here.
      const relationshipLabels = normalizeRelationshipLabels(entity.relationships);
      if (relationshipLabels.length > 0) {
        mergeRelationshipLabelsIntoAttributes(existing.attributes, relationshipLabels);
      }
      if (entity.users && entity.users.length > 0) {
        existing.attributes.users = [...((existing.attributes.users as string[]) || []), ...entity.users];
      }
      if (entity.members && entity.members.length > 0) {
        existing.attributes.members = [...((existing.attributes.members as string[]) || []), ...entity.members];
      }
      if (entity.purpose) existing.attributes.purpose = entity.purpose;
      const newStructured = incomingStructuredFields;
      for (const [k, v] of Object.entries(newStructured)) {
        if (v != null && existing.structured_fields[k] == null) {
          existing.structured_fields[k] = v;
        }
      }
    } else {
      const attrs: Record<string, unknown> = { ...(entity.attributes || {}) };
      if (entity.abilities && entity.abilities.length > 0) attrs.abilities = entity.abilities;
      const relationshipLabels = normalizeRelationshipLabels(entity.relationships);
      if (relationshipLabels.length > 0) mergeRelationshipLabelsIntoAttributes(attrs, relationshipLabels);
      if (entity.users && entity.users.length > 0) attrs.users = entity.users;
      if (entity.members && entity.members.length > 0) attrs.members = entity.members;
      if (entity.purpose) attrs.purpose = entity.purpose;

      // Build chunk_ids and page_numbers from chunk_positions
      const chunkIds: string[] = [];
      const pageNumbers: number[] = [];
      for (const pos of entity.chunk_positions || []) {
        const chunkInfo = chunkLookup.get(pos);
        if (chunkInfo?.id) chunkIds.push(chunkInfo.id);
        if (chunkInfo?.page != null) pageNumbers.push(chunkInfo.page);
      }

      entityMap.set(entityMapKey, {
        canonical_name: cleanName,
        entity_type: type,
        entity_types: [type],
        description: entity.description || entity.significance || null,
        attributes: attrs,
        structured_fields: incomingStructuredFields,
        aliases: (entity.aliases || []).map(a => stripNikud(a)).filter(Boolean),
        evidence: entity.evidence || [],
        chunk_positions: entity.chunk_positions || [],
        chunk_ids: chunkIds.length > 0 ? chunkIds : undefined,
        page_numbers: pageNumbers.length > 0 ? pageNumbers : undefined,
        // NEW: Propagate field-specific evidence from extraction
        field_evidence: entity.field_evidence,
        field_confidence: entity.field_evidence ? computeFieldConfidence(entity.field_evidence, incomingStructuredFields) : undefined,
      });
    }
  }

  for (const char of extraction.characters || []) addEntity(char.name, "character", char);
  for (const loc of extraction.locations || []) addEntity(loc.name, "location", loc);
  for (const obj of extraction.objects || []) addEntity(obj.name, "object", obj);
  for (const ab of extraction.abilities || []) {
    const type = "ability";
    addEntity(ab.name, type, ab);
  }
  for (const mab of extraction.magic_abilities || []) {
    const type = "magic_ability";
    addEntity(mab.name, type, mab);
  }
  for (const org of extraction.organizations || []) addEntity(org.name, "organization", org);

  // ---- Entity Resolution / Consolidation ----
  // EVIDENCE-BASED CONSOLIDATION: Only merge entities with strong signals.
  // Prefer False Negatives (2 separate Leo entities) over False Positives (merging wrong Leos)
  // 
  // Evidence types that support consolidation:
  // 1. PREFIX_MATCH: "ליאו" + "ליאו פרוסט" in same type/document (score: 80)
  // 2. CO_LOCATION: Both appear in same chunk (score: 70)
  // 3. MATCHING_DESCRIPTION: Same physical attributes (score: 50)
  // 4. MATCHING_RELATIONSHIPS: Same connected entities (score: 50)
  // 
  // THRESHOLD: Score >= 70 to suggest consolidation (show in preview UI)
  //            Score >= 100 to auto-consolidate (require explicit user action for lower scores)
  
  const entries = Array.from(entityMap.entries());
  const consolidationCandidates: Array<{ keyA: string; keyB: string; score: number }> = [];

  for (let i = 0; i < entries.length; i++) {
    const [keyA, entityA] = entries[i];
    if (!entityMap.has(keyA)) continue; // already merged away

    for (let j = i + 1; j < entries.length; j++) {
      const [keyB, entityB] = entries[j];
      if (!entityMap.has(keyB)) continue; // already merged away
      if (entityA.entity_type !== entityB.entity_type) continue; // different types
      if (normalizeKey(entityA.canonical_name) === normalizeKey(entityB.canonical_name) &&
          hasConflictingEntityContext(entityA, entityB)) {
        // Same names with contradictory context are distinct entities, not a
        // consolidation candidate.
        continue;
      }

      const nameA = entityA.canonical_name;
      const nameB = entityB.canonical_name;

      // Check evidence for consolidation
      let evidence_score = 0;
      const evidence: string[] = [];

      // 1. PREFIX MATCH (strongest signal for character consolidation)
      const aIsPrefix = isPrefixMatch(nameA, nameB);
      const bIsPrefix = isPrefixMatch(nameB, nameA);
      if (aIsPrefix || bIsPrefix) {
        evidence_score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES["prefix_match"];
        evidence.push("prefix_match");
      }

      // 2. CO-LOCATION: Both mention same chunk positions
      const commonChunks = entityA.chunk_positions.filter((p) => entityB.chunk_positions.includes(p));
      if (commonChunks.length > 0) {
        evidence_score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES["co_location"];
        evidence.push(`co_location(${commonChunks.length} shared chunks)`);
      }

      // 3. MATCHING DESCRIPTION: Same description (or very similar)
      if (entityA.description && entityB.description && entityA.description === entityB.description) {
        evidence_score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES["matching_description"];
        evidence.push("matching_description");
      }

      // 4. MATCHING RELATIONSHIPS: Same relationships (if we have them)
      const relationshipsA = normalizeRelationshipLabels(entityA.attributes.relationships);
      const relationshipsB = normalizeRelationshipLabels(entityB.attributes.relationships);
      const commonRelationships = relationshipsA.filter((r) => relationshipsB.includes(r));
      if (commonRelationships.length > 0) {
        evidence_score += CONSOLIDATION_THRESHOLDS.EVIDENCE_SCORES["matching_relationships"];
        evidence.push(`matching_relationships(${commonRelationships.length})`);
      }

      // Decision: only consolidate if score >= SUGGEST threshold
      if (evidence_score >= CONSOLIDATION_THRESHOLDS.SUGGEST_CONSOLIDATION_THRESHOLD) {
        consolidationCandidates.push({ keyA, keyB, score: evidence_score });
      }
    }
  }

  // Apply consolidations (merge them)
  // CRITICAL FIX: Only merge when score >= AUTO threshold (100), not SUGGEST (70)
  // This prevents false merges that would permanently contaminate the knowledge base
  for (const { keyA, keyB, score } of consolidationCandidates.sort((a, b) => b.score - a.score)) {
    const entityA = entityMap.get(keyA);
    const entityB = entityMap.get(keyB);
    if (!entityA || !entityB) continue;

    // CRITICAL: Only auto-merge when score >= AUTO threshold
    // Scores between SUGGEST (70) and AUTO (100-1) should be persisted as suggestions
    if (score < CONSOLIDATION_THRESHOLDS.AUTO_CONSOLIDATE_THRESHOLD) {
      // Score 70-99: Persist as resolution suggestion for user review
      // (Note: This requires integration with createResolutionSuggestion from resolution-suggestions.ts)
      console.log(`[extract-knowledge] Consolidation SUGGESTED (not auto-merged): "${entityA.canonical_name}" ↔ "${entityB.canonical_name}" (score: ${score}, need: ${CONSOLIDATION_THRESHOLDS.AUTO_CONSOLIDATE_THRESHOLD})`);
      // TODO: Call createResolutionSuggestion here with the entity IDs
      // This requires fetching entity IDs from the database, which happens later in persistence
      continue;
    }

    // Merge: longer name wins as canonical
    const [keepKey, keep, removeKey, remove] = entityA.canonical_name.length >= entityB.canonical_name.length
      ? [keyA, entityA, keyB, entityB]
      : [keyB, entityB, keyA, entityA];

    // Add shorter name as alias
    if (!keep.aliases.includes(remove.canonical_name)) {
      keep.aliases.push(remove.canonical_name);
    }
    // Merge aliases from the removed entity
    for (const alias of remove.aliases) {
      if (alias && !keep.aliases.includes(alias) && alias !== keep.canonical_name) {
        keep.aliases.push(alias);
      }
    }
    // Merge evidence and positions
    for (const e of remove.evidence) {
      if (!keep.evidence.includes(e)) keep.evidence.push(e);
    }
    for (const p of remove.chunk_positions) {
      if (!keep.chunk_positions.includes(p)) keep.chunk_positions.push(p);
    }
    // Merge description
    if (!keep.description && remove.description) keep.description = remove.description;
    // Merge structured_fields (fill nulls)
    for (const [k, v] of Object.entries(remove.structured_fields)) {
      if (v != null && keep.structured_fields[k] == null) {
        keep.structured_fields[k] = v;
      }
    }
    // Merge attributes
    for (const [k, v] of Object.entries(remove.attributes)) {
      if (v != null && keep.attributes[k] == null) {
        keep.attributes[k] = v;
      }
    }

    console.log(`[extract-knowledge] Consolidation AUTO-MERGED: "${remove.canonical_name}" → "${keep.canonical_name}" (score: ${score})`);

    // Remove the other entity from the map
    entityMap.delete(removeKey);
  }

  // Apply post-processing filters from centralized rules
  const results: NormalizedEntity[] = [];
  let filteredCount = 0;
  for (const entity of entityMap.values()) {
    if (!shouldFilterEntity(entity)) {
      results.push(entity);
    } else {
      filteredCount++;
    }
  }
  if (filteredCount > 0) {
    console.log(`[extract-knowledge] Filtered out ${filteredCount} entities (generic/invalid)`);
  }

  return results;
}

// ============================================
// Error helper
// ============================================

function errorResponse(message: string, status: number, details?: string): Response {
  // Preserve the existing HTTP 200 envelope contract for the client, but make
  // the internal error status visible in Supabase Edge Function logs.
  console.error(
    "[extract-knowledge] Application error",
    JSON.stringify({
      response_status: 200,
      error_status: status,
      message,
      details: details || null,
    }),
  );

  return new Response(
    JSON.stringify({ success: false, error: message, status, details: details || null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function buildOverlayChanges(
  existing: EntityResolutionRecord,
  entity: NormalizedEntity,
): { overrides: Record<string, unknown>; baseValues: Record<string, unknown> } {
  const overrides: Record<string, unknown> = {};
  const baseValues: Record<string, unknown> = {};
  const existingStructured = (existing.structured_fields || {}) as Record<string, unknown>;
  const existingAttributes = (existing.attributes || {}) as Record<string, unknown>;

  const addChange = (field: string, nextValue: unknown, currentValue: unknown) => {
    if (nextValue == null || JSON.stringify(nextValue) === JSON.stringify(currentValue)) return;
    overrides[field] = nextValue;
    baseValues[field] = currentValue ?? null;
  };

  addChange('canonical_name', entity.canonical_name, existing.canonical_name);
  addChange('entity_type', entity.entity_type, existing.entity_type);
  addChange('description', entity.description, existing.description);

  for (const [key, value] of Object.entries(entity.attributes)) {
    addChange(`attributes.${key}`, value, existingAttributes[key]);
  }
  for (const [key, value] of Object.entries(entity.structured_fields)) {
    addChange(`structured_fields.${key}`, value, existingStructured[key]);
  }

  return { overrides, baseValues };
}

type ExtractionEntityCandidate = EntityResolutionRecord & {
  id: string;
  source: string;
  layer: "main" | "branch";
  branch_id: string | null;
  overlayOverrides?: Record<string, unknown>;
  overlayBaseValues?: Record<string, unknown>;
};

async function loadEntityAliases(
  supabase: any,
  entityIds: string[],
  branchId: string | null,
): Promise<Map<string, string[]>> {
  const aliasesByEntity = new Map<string, string[]>();
  if (entityIds.length === 0) return aliasesByEntity;

  let query = supabase
    .from("knowledge_entity_aliases")
    .select("entity_id, alias")
    .in("entity_id", entityIds);
  query = branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null);

  const { data: aliases, error } = await query;
  if (error) throw new Error(`Failed to fetch entity aliases: ${error.message}`);

  for (const alias of aliases || []) {
    const values = aliasesByEntity.get(alias.entity_id) || [];
    values.push(alias.alias);
    aliasesByEntity.set(alias.entity_id, values);
  }

  return aliasesByEntity;
}

async function findExistingEntity(
  supabase: any,
  projectId: string,
  userId: string,
  branchId: string,
  entity: NormalizedEntity,
): Promise<ExtractionEntityCandidate | null> {
  const entitySelect = "id, canonical_name, entity_type, entity_types, structured_fields, attributes, source, description, layer, branch_id";
  const [mainResult, branchResult, overlayResult] = await Promise.all([
    supabase
      .from("knowledge_entities")
      .select(entitySelect)
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("layer", "main"),
    supabase
      .from("knowledge_entities")
      .select(entitySelect)
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("layer", "branch")
      .eq("branch_id", branchId),
    supabase
      .from("knowledge_branch_entities")
      .select("entity_id, source_entity_id, overrides, base_values")
      .eq("branch_id", branchId)
      .not("source_entity_id", "is", null),
  ]);

  if (mainResult.error) throw new Error(`Failed to fetch Main entity candidates: ${mainResult.error.message}`);
  if (branchResult.error) throw new Error(`Failed to fetch Branch entity candidates: ${branchResult.error.message}`);
  if (overlayResult.error) throw new Error(`Failed to fetch Branch overlays: ${overlayResult.error.message}`);

  const mainRows = (mainResult.data || []) as ExtractionEntityCandidate[];
  const branchRows = (branchResult.data || []) as ExtractionEntityCandidate[];
  const overlays = (overlayResult.data || []) as Array<{
    entity_id: string;
    source_entity_id: string | null;
    overrides: Record<string, unknown> | null;
    base_values: Record<string, unknown> | null;
  }>;

  const mainIds = mainRows.map((row) => row.id);
  const branchIds = branchRows.map((row) => row.id);
  const mainAliases = await loadEntityAliases(supabase, mainIds, null);
  const branchAliases = await loadEntityAliases(supabase, [...mainIds, ...branchIds], branchId);
  const overlayByMainId = new Map(
    overlays
      .filter((overlay) => overlay.source_entity_id)
      .map((overlay) => [overlay.source_entity_id as string, overlay]),
  );

  const mainCandidates = mainRows.map((row) => {
    const overlay = overlayByMainId.get(row.id);
    const effective = overlay
      ? applyEntityOverrides(row, overlay.overrides || {})
      : row;

    return {
      ...effective,
      id: row.id,
      layer: "main" as const,
      branch_id: null,
      aliases: [
        ...(mainAliases.get(row.id) || []),
        ...(branchAliases.get(row.id) || []),
      ],
      overlayOverrides: overlay?.overrides || undefined,
      overlayBaseValues: overlay?.base_values || undefined,
    };
  });

  const branchCandidates = branchRows.map((row) => ({
    ...row,
    layer: "branch" as const,
    aliases: branchAliases.get(row.id) || [],
  }));

  return resolveExtractionCandidate(entity, branchCandidates, mainCandidates);
}

async function findExistingMainEntity(
  supabase: any,
  projectId: string,
  userId: string,
  versionId: string,
  entity: NormalizedEntity,
): Promise<ExtractionEntityCandidate | null> {
  const entitySelect = "id, canonical_name, entity_type, entity_types, structured_fields, attributes, source, description, layer, branch_id, created_at";
  const { data, error } = await supabase
    .from("knowledge_entities")
    .select(entitySelect)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("version_id", versionId)
    .eq("layer", "main")
    .is("branch_id", null)
    .eq("canonical_name", entity.canonical_name)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`Failed to find existing Main entity: ${error.message}`);

  const existing = (data?.[0] || null) as ExtractionEntityCandidate | null;
  return existing;
}

function mergeNonNullFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

function mergeExistingBranchEntity(
  existing: ExtractionEntityCandidate,
  incoming: NormalizedEntity,
): NormalizedEntity {
  const canonicalName = incoming.canonical_name.length > existing.canonical_name.length
    ? incoming.canonical_name
    : existing.canonical_name;

  return {
    canonical_name: canonicalName,
    entity_type: existing.entity_type,
    entity_types: [...new Set([...(existing.entity_types || []), ...incoming.entity_types])],
    description: existing.description || incoming.description,
    attributes: mergeNonNullFields(existing.attributes, incoming.attributes),
    structured_fields: mergeNonNullFields(existing.structured_fields, incoming.structured_fields),
    aliases: [...new Set([...(existing.aliases || []), ...incoming.aliases])],
    evidence: [...new Set([...(incoming.evidence || [])])],
    chunk_positions: [...new Set([...(incoming.chunk_positions || [])])],
  };
}

function findBatchEntityId(
  name: string,
  entries: Array<{ entity: NormalizedEntity; id: string }>,
): string | null {
  const key = normalizeKey(name);
  const matches = entries.filter(({ entity }) =>
    normalizeKey(entity.canonical_name) === key ||
    entity.aliases.some((alias) => normalizeKey(alias) === key),
  );
  const ids = [...new Set(matches.map(({ id }) => id))];
  // Name-only references are safe only when the batch contains one candidate.
  return ids.length === 1 ? ids[0] : null;
}

async function findPersistedEntityId(
  supabase: any,
  projectId: string,
  userId: string,
  branchId: string | null,
  name: string,
  entityType?: string | null,
  batchEntries: Array<{ entity: NormalizedEntity; id: string }> = [],
): Promise<string | null> {
  const batchId = findBatchEntityId(name, batchEntries);
  if (batchId) return batchId;
  const key = normalizeKey(name);
  if (!key) return null;

  const mainQuery = supabase
    .from("knowledge_entities")
    .select("id, canonical_name, entity_type, entity_types")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("layer", "main");
  const branchQuery = branchId
    ? supabase
      .from("knowledge_entities")
      .select("id, canonical_name, entity_type, entity_types")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("layer", "branch")
      .eq("branch_id", branchId)
    : Promise.resolve({ data: [], error: null });

  const [mainResult, branchResult] = await Promise.all([mainQuery, branchQuery]);
  if (mainResult.error) throw new Error(`Failed to resolve Main entity reference: ${mainResult.error.message}`);
  if (branchResult.error) throw new Error(`Failed to resolve Branch entity reference: ${branchResult.error.message}`);

  const rows = [...(mainResult.data || []), ...(branchResult.data || [])] as Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    entity_types?: string[];
  }>;
  const aliases = await loadEntityAliases(
    supabase,
    rows.map((row) => row.id),
    branchId,
  );
  const matches = rows.filter((row) => {
    const types = [row.entity_type, ...(row.entity_types || [])];
    if (entityType && !types.includes(entityType)) return false;
    return normalizeKey(row.canonical_name) === key ||
      (aliases.get(row.id) || []).some((alias) => normalizeKey(alias) === key);
  });
  const ids = [...new Set(matches.map((row) => row.id))];
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Load the entity context required by ability links across all extraction
 * batches. The current batch is merged later so its freshly normalized
 * attributes take precedence over the persisted snapshot.
 */
async function loadPersistedAbilityLinkEntries(
  supabase: any,
  projectId: string,
  userId: string,
  branchId: string | null,
): Promise<AbilityLinkEntity[]> {
  const entitySelect = "id, canonical_name, entity_type, entity_types, attributes, layer, branch_id";
  const mainQuery = supabase
    .from("knowledge_entities")
    .select(entitySelect)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("layer", "main");
  const branchQuery = branchId
    ? supabase
      .from("knowledge_entities")
      .select(entitySelect)
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("layer", "branch")
      .eq("branch_id", branchId)
    : Promise.resolve({ data: [], error: null });
  const overlayQuery = branchId
    ? supabase
      .from("knowledge_branch_entities")
      .select("entity_id, overrides")
      .eq("branch_id", branchId)
      .not("source_entity_id", "is", null)
    : Promise.resolve({ data: [], error: null });

  const [mainResult, branchResult, overlayResult] = await Promise.all([
    mainQuery,
    branchQuery,
    overlayQuery,
  ]);
  if (mainResult.error) throw new Error(`Failed to load Main ability-link entities: ${mainResult.error.message}`);
  if (branchResult.error) throw new Error(`Failed to load Branch ability-link entities: ${branchResult.error.message}`);
  if (overlayResult.error) throw new Error(`Failed to load Branch ability-link overlays: ${overlayResult.error.message}`);

  const rows = [
    ...(mainResult.data || []),
    ...(branchResult.data || []),
  ] as Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    entity_types?: string[];
    attributes?: Record<string, unknown> | null;
    layer: "main" | "branch";
    branch_id: string | null;
  }>;
  const aliases = await loadEntityAliases(
    supabase,
    rows.map((row) => row.id),
    branchId,
  );
  const overlays = new Map<string, Record<string, unknown>>(
    ((overlayResult.data || []) as Array<{
      entity_id: string;
      overrides: Record<string, unknown> | null;
    }>)
      .filter((row) => row.entity_id && row.overrides)
      .map((row) => [row.entity_id, row.overrides as Record<string, unknown>]),
  );

  return rows.map((row) => {
    const effective = row.layer === "main" && overlays.has(row.id)
      ? applyEntityOverrides(row, overlays.get(row.id) || {})
      : row;
    return {
      id: row.id,
      canonical_name: effective.canonical_name,
      entity_type: effective.entity_type,
      aliases: aliases.get(row.id) || [],
      attributes: effective.attributes || {},
    };
  });
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  const requestStartedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  try {

    // ==============================
    // Validation: Required base fields
    // ==============================
    if (!body.version_id || !body.project_id || !body.document_id || !body.user_id) {
      return errorResponse("Missing required fields: version_id, project_id, document_id, user_id.", 400);
    }

    if (![body.version_id, body.project_id, body.document_id, body.user_id].every(isUuid)) {
      return errorResponse("version_id, project_id, document_id, and user_id must be valid UUIDs.", 400);
    }

    if (body.target_branch_id !== undefined && body.target_branch_id !== null && !isUuid(body.target_branch_id)) {
      return errorResponse("target_branch_id must be a valid UUID.", 400);
    }

    if (body.extraction_run_id !== undefined && !isUuid(body.extraction_run_id)) {
      return errorResponse("extraction_run_id must be a valid UUID.", 400);
    }

    const modelProfile = body.model_profile ?? DEFAULT_MODEL_PROFILE;
    if (!isGeminiModelProfile(modelProfile)) {
      return errorResponse("Invalid model_profile. Choose a supported extraction model.", 400);
    }
    if (body.skip_per_batch === true && modelProfile !== "sub-base-locations") {
      return errorResponse("skip_per_batch is supported only for sub-base-locations.", 400);
    }

    const strategyValidation = validateExtractionStrategy(body.extraction_strategy);
    if (!strategyValidation.ok) {
      return errorResponse(`Invalid extraction strategy: ${strategyValidation.error}`, 400);
    }
    const extractionStrategy: ExtractionStrategy = strategyValidation.strategy;
    const rolloutValidation = validateExtractionStrategyRollout(
      extractionStrategy,
      isParallelExpertsRolloutEnabled(Deno.env.get(PARALLEL_EXPERTS_ROLLOUT_ENV)),
    );
    if (!rolloutValidation.ok) return errorResponse(rolloutValidation.error, 403);

    // ==============================
    // Validation: Main vs Branch extraction mode
    // CRITICAL FIX: Use extraction_mode (set per extraction run) instead of checking per batch
    // ==============================
    const extractionMode = body.extraction_mode;
    const extractionRunId = body.extraction_run_id?.trim() || null;
    const modeValidation = validateExtractionMode(body);
    if (!modeValidation.ok) return errorResponse(`Invalid extraction mode: ${modeValidation.error}`, 400);

    // For backward compatibility, fall back to legacy behavior if extraction_mode not provided
    const useMainForExtraction = modeValidation.mode === 'bootstrap';
    const hasBranchId = !!body.target_branch_id;

    // ==============================
    // Authenticate user
    // ==============================
    const authHeader = req.headers.get("Authorization");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } },
    );
    const { data: { user: authenticatedUser }, error: authError } = await authClient.auth.getUser();

    if (authError || !authenticatedUser || authenticatedUser.id !== body.user_id) {
      return errorResponse("Extraction rejected: authenticated user does not match the extraction request.", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ==============================
    // Authorization: Extraction mode validation
    // CRITICAL FIX: Use extraction_mode that was determined at RUN level
    // Do NOT re-check Main state on every batch
    // ==============================
    let targetLayer: "main" | "branch" = "branch";
    let targetBranchId: string | null = null;

    if (extractionMode === 'bootstrap' || useMainForExtraction) {
      // Bootstrap mode: all batches from one extraction run write to Main.
      // A prior raw extraction is the durable marker that this run already
      // passed the empty-Main guard on its first batch.
      let isBootstrapContinuation = false;

      if (extractionRunId) {
        const { data: priorBatch, error: priorBatchError } = await supabase
          .from("raw_extractions")
          .select("id")
          .eq("project_id", body.project_id)
          .eq("document_id", body.document_id)
          .eq("version_id", body.version_id)
          .eq("user_id", authenticatedUser.id)
          .eq("extraction_run_id", extractionRunId)
          .eq("model_profile", modelProfile)
          .is("branch_id", null)
          .limit(1)
          .maybeSingle();

        if (priorBatchError) {
          return errorResponse(`Failed to validate bootstrap extraction run: ${priorBatchError.message}`, 500);
        }

        isBootstrapContinuation = Boolean(priorBatch);
      }

      if (!isBootstrapContinuation) {
        // Only a new bootstrap run must prove that Main is still empty.
        const { data: mainEntities, error: mainCheckError } = await supabase
          .from("knowledge_entities")
          .select("id")
          .eq("project_id", body.project_id)
          .eq("user_id", authenticatedUser.id)
          .eq("layer", "main")
          .neq("canonical_name", "__bootstrap__")
          .limit(1);

        if (mainCheckError) {
          return errorResponse(`Failed to check Main layer state: ${mainCheckError.message}`, 500);
        }

        if (mainEntities && mainEntities.length > 0) {
          // A different/new bootstrap run cannot write to an initialized Main.
          return errorResponse(
            "Bootstrap extraction mode rejected: Main layer already has entities. " +
            "Use extraction_mode='branch' for subsequent extractions.",
            400
          );
        }
      }

      targetLayer = "main";
      targetBranchId = null;
      console.log(
        `[extract-knowledge] Extraction run ${extractionRunId ?? "legacy"}: ` +
        `BOOTSTRAP mode - writing to Main (${isBootstrapContinuation ? "continuation" : "initial batch"})`,
      );
    } else {
      // Branch mode: All batches go to the specified active branch
      const { data: activeBranch, error: branchError } = await supabase
        .from("knowledge_branches")
        .select("id, profile")
        .eq("id", body.target_branch_id)
        .eq("project_id", body.project_id)
        .eq("user_id", authenticatedUser.id)
        .eq("profile", modelProfile)
        .eq("is_current", true)
        .eq("status", "active")
        .maybeSingle();

      if (branchError) {
        return errorResponse(`Failed to validate active branch: ${branchError.message}`, 500);
      }

      if (!activeBranch) {
        return errorResponse(
          `Extraction rejected: target_branch_id is not an active ${modelProfile} Branch for this project.`,
          400,
        );
      }

      targetLayer = "branch";
      targetBranchId = activeBranch.id;
      console.log(`[extract-knowledge] Extraction run ${extractionRunId}: BRANCH mode - writing to branch ${activeBranch.id}`);
    }

    if (extractionRunId) {
      const { data: priorRun, error: priorRunError } = await supabase
        .from("raw_extractions")
        .select("document_id, version_id, branch_id, model_profile, extraction_strategy")
        .eq("project_id", body.project_id)
        .eq("user_id", authenticatedUser.id)
        .eq("extraction_run_id", extractionRunId)
        .limit(1)
        .maybeSingle();

      if (priorRunError) {
        return errorResponse(`Failed to validate extraction run lineage: ${priorRunError.message}`, 500);
      }

      if (priorRun && (
        priorRun.document_id !== body.document_id ||
        priorRun.version_id !== body.version_id ||
        priorRun.branch_id !== targetBranchId ||
        priorRun.model_profile !== modelProfile ||
        (priorRun.extraction_strategy ?? DEFAULT_EXTRACTION_STRATEGY) !== extractionStrategy
      )) {
        return errorResponse(
          "Extraction run rejected: profile, Branch, document, or version does not match the existing run.",
          400,
        );
      }
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return errorResponse("GEMINI_API_KEY not configured", 500);
    }

    const quota = await assertQuillsAvailable(supabase, authenticatedUser.id);
    if (!quota.available) {
      return errorResponse("INSUFFICIENT_QUILLS", 402);
    }

    console.log(`[extract-knowledge] Version: 2.5.0 | Layer: ${targetLayer} | Model profile: ${modelProfile} | Strategy: ${extractionStrategy} | Auth: OK`);

    const offset = body.offset ?? 0;
    const limit = body.limit ?? BATCH_SIZE;

    // ==============================
    // Step 1: Fetch chunks from DB
    // ==============================
    const chunkFetchStartedAt = Date.now();
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("id, content, position, page")
      .eq("version_id", body.version_id)
      .order("position", { ascending: true })
      .range(offset, offset + limit - 1);

    if (chunksError) {
      console.error(`[extract-knowledge] Failed to load chunks for version ${body.version_id}:`, chunksError.message);
      return errorResponse(
        `Failed to load document chunks: ${chunksError.message}`,
        500,
        `version_id=${body.version_id}`,
      );
    }

    if (!chunks || chunks.length === 0) {
      console.error(`[extract-knowledge] No document chunks found for version ${body.version_id} at offset ${offset}.`);
      return errorResponse(
        "No document chunks found. Wait for document processing to finish, then retry extraction.",
        422,
        `version_id=${body.version_id}, offset=${offset}`,
      );
    }

    // Build chunk lookup map for mentions persistence
    const chunkLookup = new Map<number, { id: string; page: number | null }>();
    for (const c of chunks) {
      chunkLookup.set(c.position, { id: c.id, page: c.page });
    }

    const chunkData = chunks.map((c: { position: number; content: string; page: number | null }) => ({
      position: c.position,
      content: c.content,
    }));
    const chunkFetchLatencyMs = Date.now() - chunkFetchStartedAt;

    // ==============================
    // Step 2: Call Gemini (with multi-model fallback)
    // ==============================
    const promptBuildStartedAt = Date.now();
    let projectPlaceFields: Array<{ place_type_key: string; field_key: string; label: string }> = [];
    let projectCharacterFields: Array<{ field_key: string; label: string; group_key: string }> = [];
    if (modelProfile === "sub-base-locations") {
      const { data, error } = await supabase
        .from("knowledge_place_field_definitions")
        .select("place_type_key, field_key, label")
        .eq("project_id", body.project_id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) {
        console.warn("[extract-knowledge] Could not load project place fields:", error.message);
      }
      projectPlaceFields = (data || []) as Array<{ place_type_key: string; field_key: string; label: string }>;

      const { data: characterData, error: characterError } = await supabase
        .from("knowledge_character_field_definitions")
        .select("field_key, label, group_key")
        .eq("project_id", body.project_id)
        .eq("model_profile", "sub-base-locations")
        .eq("is_active", true)
        .order("sort_order");
      if (characterError) {
        console.warn("[extract-knowledge] Could not load project character fields:", characterError.message);
      }
      projectCharacterFields = (characterData || []) as Array<{ field_key: string; label: string; group_key: string }>;
    }

    const prompt = buildPrompt(chunkData, modelProfile, projectPlaceFields, projectCharacterFields);
    const promptBuildLatencyMs = Date.now() - promptBuildStartedAt;
    const totalChars = chunkData.reduce((sum, c) => sum + c.content.length, 0);
    let extraction: GeminiExtraction;
    let responseText = "";
    let storageSafeExtraction: GeminiExtraction | null = null;
    let modelUsed: string;
    let latencyMs: number;
    let usage: Record<string, unknown>;
    let expertModels: Array<{
      id: string;
      role: string;
      window_id: string;
      model: string | null;
    }> = [];

    if (extractionStrategy === "parallel-experts") {
      if (!extractionRunId) {
        return errorResponse("parallel-experts requires extraction_run_id so specialist artifacts can be resumed safely.", 400);
      }
      try {
        const merged = await executeParallelExpertExtraction({
          supabase,
          api_key: geminiApiKey,
          project_id: body.project_id,
          document_id: body.document_id,
          version_id: body.version_id,
          user_id: body.user_id,
          extraction_run_id: extractionRunId,
          branch_id: targetBranchId,
          model_profile: modelProfile,
          chunks: chunkData,
          offset,
          limit,
        });
        extraction = merged.extraction as GeminiExtraction;
        expertModels = merged.expert_models;
        modelUsed = merged.model;
        latencyMs = merged.latency_ms;
        usage = {
          promptTokenCount: merged.usage.input_tokens,
          candidatesTokenCount: merged.usage.output_tokens,
          thoughtsTokenCount: merged.usage.thinking_tokens,
          cachedContentTokenCount: merged.usage.cached_tokens,
          totalTokenCount: merged.usage.total_tokens,
        };
        const parallelValidation = validateExtractionPayload(extraction);
        if (!parallelValidation.valid) {
          throw new Error(`Merged parallel extraction is invalid: ${parallelValidation.errors.join("; ")}`);
        }
        storageSafeExtraction = cloneJsonValue(extraction) as GeminiExtraction | null;
        if (!storageSafeExtraction) {
          throw new Error("Merged parallel extraction could not be serialized as JSON.");
        }
      } catch (parallelError) {
        const message = parallelError instanceof Error ? parallelError.message : "Parallel expert execution failed";
        console.error(
          "[extract-knowledge] Parallel expert execution failed",
          JSON.stringify({
            response_status: 200,
            error_status: 502,
            extraction_run_id: extractionRunId,
            version_id: body.version_id,
            offset,
            limit,
            model_profile: modelProfile,
            extraction_strategy: extractionStrategy,
            error: message,
          }),
        );
        return errorResponse(message, 502);
      }
    } else {
      const geminiResult = await callGeminiWithFallback(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
        },
      },
      geminiApiKey,
      {
        timeoutMs: 60_000,
        models: GEMINI_MODEL_PROFILES[modelProfile],
      }
    );

    if (!geminiResult.success) {
      const skipReason = getExtractionSkipReason(
        modelProfile,
        body.skip_per_batch === true,
        geminiResult,
      );
      if (skipReason) {
        console.warn(
          `[extract-knowledge] Skipping ${chunks.length} chunk(s) at offset ${offset}: ${skipReason}`,
        );
        return new Response(
          JSON.stringify(buildSkippedBatchResponse(skipReason, chunks, offset, limit)),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.error("[extract-knowledge] Gemini fallback chain exhausted:", JSON.stringify(geminiResult.fallbackChain));
      return errorResponse(geminiResult.error, geminiResult.status, geminiResult.details);
    }

    const { data: geminiData, modelUsed: responseModel, latencyMs: responseLatency } = geminiResult;
    modelUsed = responseModel;
    latencyMs = responseLatency;
    responseText = getGeminiResponseText(geminiData) || "";
    const candidates = Array.isArray((geminiData as Record<string, unknown>).candidates)
      ? (geminiData as Record<string, unknown>).candidates as unknown[]
      : [];
    console.log(`[extract-knowledge] Model: ${modelUsed}, Response length: ${responseText.length}, Candidates: ${candidates.length}`);

    if (!responseText) {
      const message = `Gemini returned an empty response from ${modelUsed}.`;
      console.error(`[extract-knowledge] ${message}`);
      return errorResponse(
        message,
        502,
        `model=${modelUsed}, candidates=${candidates.length}`,
      );
    }
    const rawUsage = (geminiData as Record<string, unknown>)?.usageMetadata;
    usage = rawUsage && typeof rawUsage === "object" && !Array.isArray(rawUsage)
      ? rawUsage as Record<string, unknown>
      : {};

    if (modelUsed !== DEFAULT_MODEL) {
      console.log(`[extract-knowledge] Used fallback model: ${modelUsed} (primary: ${DEFAULT_MODEL})`);
    }

    const parsedExtraction = parseExtractionJson<unknown>(responseText);
    const normalizedExtraction = normalizeExtractionPayload<GeminiExtraction>(parsedExtraction);
    if (!normalizedExtraction) {
      const message = "Gemini returned JSON that does not match the extraction schema.";
      console.error(`[extract-knowledge] ${message} offset=${offset}`);
      return errorResponse(
        message,
        502,
        `model=${modelUsed}, response_length=${responseText.length}`,
      );
    }
    extraction = normalizedExtraction;

    const extractionValidation = validateExtractionPayload(extraction);
    if (!extractionValidation.valid) {
      const message = "Gemini returned an invalid extraction payload.";
      console.error(`[extract-knowledge] ${message}`, extractionValidation.errors);
      return errorResponse(
        message,
        502,
        extractionValidation.errors.slice(0, 20).join("; "),
      );
    }
    if (extractionValidation.errors.length > 0) {
      console.warn("[extract-knowledge] Extraction payload warnings:", extractionValidation.errors);
    }

    // JSON.parse normally guarantees JSON-safe data, but normalize the value
    // again before any JSONB write. This prevents a malformed/non-serializable
    // value from reaching PostgreSQL and charging the user before failure.
    storageSafeExtraction = cloneJsonValue(extraction) as GeminiExtraction | null;
    if (!storageSafeExtraction) {
      const message = "Extraction payload could not be serialized as JSON.";
      console.error(`[extract-knowledge] ${message} offset=${offset}`);
      return errorResponse(message, 422);
    }
    }

    const extractedItemCount = [
      extraction.characters,
      extraction.locations,
      extraction.objects,
      extraction.abilities,
      extraction.magic_abilities,
      extraction.organizations,
      extraction.events,
      extraction.relationships,
    ].reduce((total, items) => total + (items?.length || 0), 0);

    if (extractedItemCount === 0) {
      const message = "Gemini returned a valid extraction response with no extractable items.";
      console.warn(`[extract-knowledge] ${message} offset=${offset}`);
      return errorResponse(
        message,
        422,
        `model=${modelUsed}, response_length=${responseText.length}`,
      );
    }

    let quillCharge;

    // ==============================
    // Step 4: Save raw extraction
    // ==============================
    const { data: rawExtraction, error: rawError } = await supabase
      .from("raw_extractions")
      .insert({
        project_id: body.project_id,
        document_id: body.document_id,
        version_id: body.version_id,
        user_id: body.user_id,
        branch_id: targetBranchId || null,  // null for Main bootstrap, branchId for Branch
        extraction_run_id: extractionRunId,
        model: modelUsed,
        model_profile: modelProfile,
        extraction_strategy: extractionStrategy,
        raw_response: storageSafeExtraction,
        input_tokens: (usage as Record<string, unknown>).promptTokenCount ?? null,
        output_tokens: (usage as Record<string, unknown>).candidatesTokenCount ?? null,
        thinking_tokens: (usage as Record<string, unknown>).thoughtsTokenCount ?? null,
        total_tokens: (usage as Record<string, unknown>).totalTokenCount ?? null,
        cached_tokens: (usage as Record<string, unknown>).cachedContentTokenCount ?? null,
        latency_ms: latencyMs,
        chunks_count: chunks.length,
        total_chars: totalChars,
        extracted_item_count: extractedItemCount,
        chunk_fetch_latency_ms: chunkFetchLatencyMs,
        prompt_build_latency_ms: promptBuildLatencyMs,
      })
      .select("id")
      .single();

    if (rawError) {
      return errorResponse(`Failed to save raw extraction: ${rawError.message}`, 500);
    }

    const rawExtractionId = rawExtraction.id;
    const persistenceStartedAt = Date.now();

    // ==============================
    // Step 5: Normalize & upsert entities (incremental merge)
    // Priority: user data > existing extracted data > new extracted data > null
    // ==============================
    // ======= DEBUG: Log what Gemini extracted =======
    console.log('[extract-knowledge] Gemini extracted:', {
      characters: extraction.characters?.length || 0,
      locations: extraction.locations?.length || 0,
      objects: extraction.objects?.length || 0,
      abilities: extraction.abilities?.length || 0,
      magic_abilities: extraction.magic_abilities?.length || 0,
      events: extraction.events?.length || 0,
      relationships: extraction.relationships?.length || 0,
    });
    
    if (extraction.abilities && extraction.abilities.length > 0) {
      console.log('[extract-knowledge] Abilities found:', extraction.abilities.map(a => ({ name: a.name, type: a.ability_type })));
    }
    if (extraction.magic_abilities && extraction.magic_abilities.length > 0) {
      console.log('[extract-knowledge] Magic abilities found:', extraction.magic_abilities.map(a => ({ name: a.name, type: a.ability_type })));
    }
    // ================================================

    const normalizedEntities = normalizeEntitiesForExtraction(
      extraction,
      chunkLookup,
      modelProfile,
      { activeCharacterFieldKeys: projectCharacterFields.map(field => field.field_key) },
    );
    const entityIdEntries: Array<{ entity: NormalizedEntity; id: string }> = [];
    let entitiesSaved = 0;
    let mentionsSaved = 0;
    let aliasesSaved = 0;
    let branchEntitiesSaved = 0;
    let valuesSynced = 0;
    let valueEvidenceSynced = 0;
    const valueSyncErrors: string[] = [];
    const persistenceErrors: string[] = [];

    for (const entity of normalizedEntities) {
      // In Main bootstrap mode, entities receive new UUIDs directly.
      // In Branch mode, resolve current-Branch entities first, then Main/overlays.
      let existing: ExtractionEntityCandidate | null = null;
      let persistedMainId: string | null = null;

      if (targetLayer === "branch") {
        existing = await findExistingEntity(
          supabase,
          body.project_id,
          body.user_id,
          targetBranchId!,
          entity,
        );
      } else {
        // Main bootstrap batches can contain the same entity more than once,
        // and a retried batch can repeat an earlier insert. Resolve the row
        // within this document version before attempting another insert.
        existing = await findExistingMainEntity(
          supabase,
          body.project_id,
          body.user_id,
          body.version_id,
          entity,
        );
      }

      if (targetLayer === "main" && (entity.entity_type === "ability" || entity.entity_type === "magic_ability")) {
        // Embedded skills can be promoted in more than one batch. Reuse the
        // Main row created earlier in this extraction run instead of creating
        // duplicate ability entities.
        persistedMainId = await findPersistedEntityId(
          supabase,
          body.project_id,
          body.user_id,
          null,
          entity.canonical_name,
          entity.entity_type,
          entityIdEntries,
        );
      }

      let entityId: string;

      if (existing && targetLayer === "main") {
        // Main extraction is repeat-safe: merge observations into the row
        // already created for this version instead of inserting a duplicate.
        const merged = mergeExistingBranchEntity(existing, entity);
        const { error: mainUpdateError } = await supabase
          .from("knowledge_entities")
          .update({
            canonical_name: existing.source === "user" ? existing.canonical_name : merged.canonical_name,
            entity_types: merged.entity_types,
            description: existing.source === "user" ? existing.description : merged.description,
            attributes: existing.source === "user" ? existing.attributes : merged.attributes,
            structured_fields: existing.source === "user" ? existing.structured_fields : merged.structured_fields,
            raw_extraction_id: rawExtractionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("project_id", body.project_id)
          .eq("version_id", body.version_id)
          .eq("layer", "main")
          .is("branch_id", null);

        if (mainUpdateError) {
          const message = `Failed to update Main entity '${entity.canonical_name}': ${mainUpdateError.message}`;
          console.error(message);
          persistenceErrors.push(message);
          continue;
        }

        entityId = existing.id;
      } else if (existing) {
        if (existing.layer === "branch") {
          // Reuse the current Branch UUID and merge only non-null observations.
          // A missing field in a later extraction must not erase Branch data.
          const merged = mergeExistingBranchEntity(existing, entity);
          const { error: branchUpdateError } = await supabase
            .from("knowledge_entities")
            .update({
              canonical_name: merged.canonical_name,
              entity_types: merged.entity_types,
              description: merged.description,
              attributes: merged.attributes,
              structured_fields: merged.structured_fields,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("project_id", body.project_id)
            .eq("branch_id", targetBranchId!);

          if (branchUpdateError) {
            const message = `Failed to update Branch entity '${entity.canonical_name}': ${branchUpdateError.message}`;
            console.error(message);
            persistenceErrors.push(message);
            continue;
          }

          const { error: branchMappingError } = await supabase
            .from("knowledge_branch_entities")
            .upsert(
              {
                branch_id: targetBranchId!,
                source_entity_id: null,
                entity_id: existing.id,
                project_id: body.project_id,
                user_id: body.user_id,
                canonical_name: merged.canonical_name,
                entity_type: merged.entity_type,
                entity_types: merged.entity_types,
                description: merged.description,
                attributes: merged.attributes,
                structured_fields: merged.structured_fields,
                overrides: {
                  canonical_name: merged.canonical_name,
                  entity_type: merged.entity_type,
                  description: merged.description,
                  attributes: merged.attributes,
                  structured_fields: merged.structured_fields,
                },
                base_values: {},
                is_modified: true,
                modified_fields: ["canonical_name", "entity_type", "description", "attributes", "structured_fields"],
              },
              { onConflict: "branch_id,entity_id" },
            );

          if (branchMappingError) {
            const message = `Failed to update Branch mapping for '${entity.canonical_name}': ${branchMappingError.message}`;
            console.error(message);
            persistenceErrors.push(message);
            continue;
          }

          entityId = existing.id;
          branchEntitiesSaved++;
        } else {
          // Main entity: create or update the active Branch overlay. Preserve
          // prior overrides when this extraction omits those fields.
          const { overrides, baseValues } = buildOverlayChanges(existing, entity);
          const mergedOverrides = { ...(existing.overlayOverrides || {}), ...overrides };
          const mergedBaseValues = { ...(existing.overlayBaseValues || {}), ...baseValues };
          const { error: overlayError } = await supabase
            .from("knowledge_branch_entities")
            .upsert(
              {
                branch_id: targetBranchId!,
                source_entity_id: existing.id,
                entity_id: existing.id,
                project_id: body.project_id,
                user_id: body.user_id,
                // Preserve the legacy snapshot columns while using UUIDs for identity.
                canonical_name: existing.canonical_name,
                entity_type: existing.entity_type,
                entity_types: existing.entity_types || [],
                description: existing.description || null,
                attributes: existing.attributes || {},
                overrides: mergedOverrides,
                base_values: mergedBaseValues,
                is_modified: Object.keys(mergedOverrides).length > 0,
                modified_fields: Object.keys(mergedOverrides),
              },
              { onConflict: "branch_id,entity_id" },
            );

          if (overlayError) {
            const message = `Failed to create overlay for '${entity.canonical_name}': ${overlayError.message}`;
            console.error(message);
            persistenceErrors.push(message);
            continue;
          }
          entityId = existing.id;
          branchEntitiesSaved++;
        }
      } else if (persistedMainId) {
        entityId = persistedMainId;
      } else {
        // New entity: insert based on target layer
        const { data: inserted, error: insertError } = await supabase
          .from("knowledge_entities")
          .insert({
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            user_id: body.user_id,
            branch_id: targetBranchId || null,  // null for Main, branchId for Branch
            canonical_name: entity.canonical_name,
            entity_type: entity.entity_type,
            entity_types: entity.entity_types,
            description: entity.description,
            attributes: entity.attributes,
            raw_extraction_id: rawExtractionId,
            updated_at: new Date().toISOString(),
            layer: targetLayer,  // 'main' or 'branch'
            structured_fields: entity.structured_fields,
            source: "ai",
          })
          .select("id")
          .single();

        let insertedNewEntity = false;
        if (insertError || !inserted) {
          // Keep the flow safe even if migration 128 has not reached the
          // database yet or two extraction requests race each other.
          if (targetLayer === "main" && insertError?.code === "23505") {
            const racedEntity = await findExistingMainEntity(
              supabase,
              body.project_id,
              body.user_id,
              body.version_id,
              entity,
            );
            if (racedEntity) {
              entityId = racedEntity.id;
            } else {
              const message = `Failed to resolve Main entity after duplicate insert '${entity.canonical_name}': ${insertError.message}`;
              console.error(message);
              persistenceErrors.push(message);
              continue;
            }
          } else {
            const message = `Failed to insert ${targetLayer} entity '${entity.canonical_name}': ${insertError?.message || "no row returned"}`;
            console.error(message);
            persistenceErrors.push(message);
            continue;
          }
        } else {
          entityId = inserted.id;
          insertedNewEntity = true;
        }

        // If Branch mode: also create knowledge_branch_entities mapping
        if (insertedNewEntity && targetLayer === "branch") {
          const { error: branchMappingError } = await supabase
            .from("knowledge_branch_entities")
            .upsert(
              {
                branch_id: targetBranchId!,
                source_entity_id: null,
                entity_id: entityId,
                project_id: body.project_id,
                user_id: body.user_id,
                // Preserve the legacy snapshot columns while using the new row UUID as identity.
                canonical_name: entity.canonical_name,
                entity_type: entity.entity_type,
                entity_types: entity.entity_types,
                description: entity.description,
                attributes: entity.attributes,
                structured_fields: entity.structured_fields,
                overrides: {
                  canonical_name: entity.canonical_name,
                  entity_type: entity.entity_type,
                  description: entity.description,
                  attributes: entity.attributes,
                  structured_fields: entity.structured_fields,
                },
                base_values: {},
                is_modified: true,
                modified_fields: ["canonical_name", "entity_type", "description", "attributes", "structured_fields"],
              },
              { onConflict: "branch_id,entity_id" }
            );

          if (branchMappingError) {
            const message = `Failed to map branch-only entity '${entity.canonical_name}': ${branchMappingError.message}`;
            console.error(message);

            // Do not leave an entity that the Branch cannot address. The delete
            // is scoped to the just-created row, project and branch.
            const { error: cleanupError } = await supabase
              .from("knowledge_entities")
              .delete()
              .eq("id", entityId)
              .eq("project_id", body.project_id)
              .eq("branch_id", targetBranchId!)
              .eq("layer", "branch");
            if (cleanupError) {
              const cleanupMessage = `Failed to clean up unmapped Branch entity '${entity.canonical_name}': ${cleanupError.message}`;
              console.error(cleanupMessage);
              persistenceErrors.push(`${message}; ${cleanupMessage}`);
            } else {
              persistenceErrors.push(message);
            }
            continue;
          }
          branchEntitiesSaved++;
        }
      }

      // Count every successfully persisted entity exactly once, regardless of layer.
      entityIdEntries.push({ entity, id: entityId });
      entitiesSaved++;

      // Sync canonical values to knowledge_entity_values (after entity is created)
      const { valuesSynced: valueCount, evidenceSynced: evidenceCount, errors: syncErrors } = await syncEntityValues({
        supabase,
        entityId,
        projectId: body.project_id,
        userId: body.user_id,
        rawExtractionId,
        branchId: targetBranchId,
        normalizedEntity: entity,
      });
      valuesSynced += valueCount;
      valueEvidenceSynced += evidenceCount;
      valueSyncErrors.push(...syncErrors);

      // Mentions (saved for both Main and Branch)
      // IMPROVED: Include chunk_id and page_number for precise provenance
      for (let i = 0; i < entity.chunk_positions.length; i++) {
        const pos = entity.chunk_positions[i];
        const ev = entity.evidence[i]?.slice(0, 500) || entity.evidence[0]?.slice(0, 500) || null;
        
        // Look up chunk_id and page_number from the chunk lookup map
        const chunkInfo = chunkLookup.get(pos);
        const chunkId = chunkInfo?.id || null;
        const pageNumber = chunkInfo?.page || null;
        
        await supabase.from("knowledge_entity_mentions").upsert(
          { 
            entity_id: entityId, 
            branch_id: targetBranchId || null, 
            chunk_position: pos, 
            evidence: ev,
            chunk_id: chunkId,
            page_number: pageNumber,
          },
          { onConflict: "entity_id,chunk_position,evidence,branch_id" }
        );
        mentionsSaved++;
      }

      // Handle additional evidence beyond chunk_positions
      if (entity.evidence.length > entity.chunk_positions.length && entity.chunk_positions.length > 0) {
        const firstPos = entity.chunk_positions[0];
        const chunkInfo = chunkLookup.get(firstPos);
        
        for (let i = entity.chunk_positions.length; i < entity.evidence.length; i++) {
          await supabase.from("knowledge_entity_mentions").upsert(
            { 
              entity_id: entityId, 
              branch_id: targetBranchId || null, 
              chunk_position: firstPos, 
              evidence: entity.evidence[i]?.slice(0, 500),
              chunk_id: chunkInfo?.id || null,
              page_number: chunkInfo?.page || null,
            },
            { onConflict: "entity_id,chunk_position,evidence,branch_id" }
          );
          mentionsSaved++;
        }
      }

      // Aliases (saved for both Main and Branch)
      for (const alias of entity.aliases) {
        if (!alias) continue;
        await supabase.from("knowledge_entity_aliases").upsert(
          { entity_id: entityId, alias, branch_id: targetBranchId || null },
          { onConflict: "entity_id,alias,branch_id" }
        );
        aliasesSaved++;
      }

    }

    if (persistenceErrors.length > 0) {
      // Do not save relationships/events or report a successful batch when an
      // entity was only partially persisted. This prevents the misleading
      // "0 entities, 1 event" result and makes the database error actionable.
      return errorResponse(
        `Entity persistence failed for ${persistenceErrors.length} item(s).`,
        500,
        persistenceErrors.join("\n"),
      );
    }

    // Create character → ability relationships using both the current batch and
    // persisted Main/Branch entities. This is essential when a character and
    // its ability arrive in different requests.
    const currentAbilityLinkEntries = entityIdEntries.map(({ entity, id }) => ({
      id,
      canonical_name: entity.canonical_name,
      entity_type: entity.entity_type,
      aliases: entity.aliases,
      attributes: entity.attributes,
    } satisfies AbilityLinkEntity));
    const persistedAbilityLinkEntries = await loadPersistedAbilityLinkEntries(
      supabase,
      body.project_id,
      body.user_id,
      targetBranchId,
    );
    const allAbilityLinkEntries = mergeAbilityLinkEntries(
      persistedAbilityLinkEntries,
      currentAbilityLinkEntries,
    );
    const currentEntityIds = new Set(currentAbilityLinkEntries.map((entry) => entry.id));
    const abilityLinks = buildAbilityLinks(allAbilityLinkEntries)
      // Do not rewrite every historical link on every batch. Keep only links
      // whose character or ability was part of this batch.
      .filter((link) => currentEntityIds.has(link.characterId) || currentEntityIds.has(link.abilityId));
    let abilityRelationshipsSaved = 0;
    const abilityRelationshipErrors: string[] = [];

    for (const link of abilityLinks) {
      const abilityEntity = entityIdEntries.find(({ id }) => id === link.abilityId)?.entity;

      const { error: relError } = await supabase
        .from("knowledge_entity_relationships")
        .upsert(
          {
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            source_entity_id: link.characterId,
            target_entity_id: link.abilityId,
            relationship_type: link.relationshipType,
            evidence: null,
            chunk_position: abilityEntity?.chunk_positions?.[0] || null,
            raw_extraction_id: rawExtractionId,
            branch_id: targetBranchId || null,
            operation: "add",
            review_status: targetLayer === "main" ? "approved" : "pending",
            base_exists: false,
          },
          { onConflict: "version_id,source_entity_id,target_entity_id,relationship_type,branch_id" },
        );

      if (relError) {
        const message = `Failed to create ability relationship '${link.userName}' → '${link.abilityName}': ${relError.message}`;
        console.warn(message);
        abilityRelationshipErrors.push(message);
      } else {
        abilityRelationshipsSaved++;
      }
    }

    // ==============================
    // Step 6: Save relationships in the target layer
    // ==============================
    const containmentRelationships: ExtractedRelationship[] = [];
    if (modelProfile === "sub-base-locations") {
      // Convert explicit location containment hints to graph edges. The graph is
      // intentionally flat: no intermediate hierarchy levels are inferred.
      for (const location of extraction.locations || []) {
        const attributes = location.attributes || {};
        const rawContainers = location.container_places || attributes.container_places;
        const containers = Array.isArray(rawContainers) ? rawContainers : rawContainers ? [rawContainers] : [];
        const legacyParent = location.parent_location ? [location.parent_location] : [];
        for (const container of [...containers, ...legacyParent]) {
          const containerName = typeof container === "string"
            ? container.trim()
            : container && typeof container === "object" && "name" in container
              ? String((container as { name?: unknown }).name || "").trim()
              : "";
          if (!containerName || containerName === location.name.trim()) continue;
          containmentRelationships.push({
            character_a: location.name.trim(),
            character_b: containerName,
            relationship_type: "contained_in",
            source_type: "location",
            target_type: "location",
            evidence: location.field_evidence?.container_places || [],
            chunk_positions: location.chunk_positions || [],
          });
        }
      }
    }

    let relationshipsSaved = 0;
    const persistedRelationships = modelProfile === "sub-base-locations"
      ? extraction.relationships || []
      : (extraction.relationships || []).filter((relationship) => normalizeRelationshipType(relationship.relationship_type) !== "contained_in");
    for (const rel of [...persistedRelationships, ...containmentRelationships]) {
      const relationshipType = normalizeRelationshipType(rel.relationship_type);
      if (!relationshipType) continue;

      const sourceId = await findPersistedEntityId(
        supabase,
        body.project_id,
        body.user_id,
        targetBranchId,
        rel.character_a?.trim() || "",
        rel.source_type,
        entityIdEntries,
      );
      const targetId = await findPersistedEntityId(
        supabase,
        body.project_id,
        body.user_id,
        targetBranchId,
        rel.character_b?.trim() || "",
        rel.target_type,
        entityIdEntries,
      );
      if (!sourceId || !targetId || sourceId === targetId) continue;

      let baseExists = false;
      if (targetLayer === "branch") {
        const { data: baseRelationship, error: baseError } = await supabase
          .from("knowledge_entity_relationships")
          .select("id")
          .eq("project_id", body.project_id)
          .is("branch_id", null)
          .eq("source_entity_id", sourceId)
          .eq("target_entity_id", targetId)
          .eq("relationship_type", relationshipType)
          .limit(1)
          .maybeSingle();

        if (baseError) {
          console.error(`Failed to inspect Main relationship '${relationshipType}':`, baseError.message);
          continue;
        }
        baseExists = Boolean(baseRelationship);
      }

      const { error: relationshipError } = await supabase
        .from("knowledge_entity_relationships")
        .upsert(
          {
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            source_entity_id: sourceId,
            target_entity_id: targetId,
            relationship_type: relationshipType,
            evidence: rel.evidence?.join(" | ")?.slice(0, 1000) || null,
            chunk_position: rel.chunk_positions?.[0] || null,
            metadata: {
              description: rel.description || null,
              uncertainty: rel.uncertainty ?? null,
              source_references: rel.source_references || [],
            },
            raw_extraction_id: rawExtractionId,
            branch_id: targetBranchId,
            operation: "add",
            review_status: targetLayer === "main" ? "approved" : "pending",
            base_exists: baseExists,
          },
          { onConflict: "version_id,source_entity_id,target_entity_id,relationship_type,branch_id" },
        );

      if (relationshipError) {
        console.error(`Failed to save ${targetLayer} relationship '${relationshipType}':`, relationshipError.message);
        continue;
      }
      relationshipsSaved++;
    }

    // ==============================
    // Step 7: Save events in the target layer
    // ==============================
    let eventsSaved = 0;
    let eventMentionsSaved = 0;
    let eventParticipantsSaved = 0;
    for (const event of extraction.events || []) {
      const eventName = (event.name || event.description || event.what_happened || "unnamed event").trim().slice(0, 200);
      const eventDescription = event.what_happened || event.description || event.name || null;
      const eventBranchId = targetBranchId;

      const { data: upsertedEvent, error: eventError } = await supabase
        .from("knowledge_events")
        .upsert(
          {
            project_id: body.project_id,
            document_id: body.document_id,
            version_id: body.version_id,
            user_id: body.user_id,
            name: eventName,
            description: eventDescription,
            attributes: {
              location: event.location || null,
              participants: event.participants || [],
              extraction_meta: {
                uncertainty: event.uncertainty ?? null,
                source_references: event.source_references || [],
              },
            },
            metadata: {
              uncertainty: event.uncertainty ?? null,
              source_references: event.source_references || [],
            },
            raw_extraction_id: rawExtractionId,
            branch_id: eventBranchId,
          },
          { onConflict: "version_id,name,branch_id" },
        )
        .select("id")
        .single();

      if (eventError || !upsertedEvent) {
        console.error(`Failed to save ${targetLayer} event '${eventName}':`, eventError?.message || "no row returned");
        continue;
      }
      eventsSaved++;
      const eventId = upsertedEvent.id;

      for (const pos of event.chunk_positions || []) {
        const chunkInfo = chunkLookup.get(pos);
        const ev = event.evidence?.length ? event.evidence[0]?.slice(0, 500) : null;
        await supabase.from("knowledge_event_mentions").upsert(
          {
            event_id: eventId,
            branch_id: eventBranchId,
            chunk_position: pos,
            evidence: ev,
            chunk_id: chunkInfo?.id || null,
            page_number: chunkInfo?.page || null,
          },
          { onConflict: "event_id,chunk_position,evidence,branch_id" },
        );
        eventMentionsSaved++;
      }

      for (const participantName of event.participants || []) {
        const participantId = await findPersistedEntityId(
          supabase,
          body.project_id,
          body.user_id,
          targetBranchId,
          participantName.trim(),
          null,
          entityIdEntries,
        );
        if (!participantId) continue;
        await supabase.from("knowledge_event_participants").upsert(
          { event_id: eventId, entity_id: participantId, role: null },
          { onConflict: "event_id,entity_id" },
        );
        eventParticipantsSaved++;
      }
    }

    const persistedItemCount = entitiesSaved + abilityRelationshipsSaved + relationshipsSaved + eventsSaved;
    if (persistedItemCount === 0) {
      const message = "Extraction produced no persistable entities, relationships, or events.";
      const details = [
        `normalized_entity_count=${normalizedEntities.length}`,
        `entities_in_payload=${extraction.characters?.length || 0}`,
        `locations_in_payload=${extraction.locations?.length || 0}`,
        `objects_in_payload=${extraction.objects?.length || 0}`,
        `abilities_in_payload=${(extraction.abilities?.length || 0) + (extraction.magic_abilities?.length || 0)}`,
        `relationships_in_payload=${extraction.relationships?.length || 0}`,
        `events_in_payload=${extraction.events?.length || 0}`,
        `raw_extraction_id=${rawExtractionId}`,
      ].join(", ");
      console.error(`[extract-knowledge] ${message} ${details}`);
      return errorResponse(message, 422, details);
    }

    const persistenceLatencyMs = Date.now() - persistenceStartedAt;
    const pipelineLatencyMs = Date.now() - requestStartedAt;
    const { error: telemetryUpdateError } = await supabase
      .from("raw_extractions")
      .update({
        persistence_latency_ms: persistenceLatencyMs,
        pipeline_latency_ms: pipelineLatencyMs,
        persisted_item_count: persistedItemCount,
      })
      .eq("id", rawExtractionId);

    if (telemetryUpdateError) {
      return errorResponse(`Failed to save extraction telemetry: ${telemetryUpdateError.message}`, 500);
    }

    try {
      quillCharge = await consumeGeminiUsage(
        supabase,
        authenticatedUser.id,
        usage,
        "extract-knowledge",
        {
          project_id: body.project_id,
          document_id: body.document_id,
          version_id: body.version_id,
          extraction_run_id: extractionRunId,
          extraction_strategy: extractionStrategy,
          offset,
          model: modelUsed,
        },
        `extract:${extractionRunId ?? body.version_id}:${offset}`,
      );
    } catch (chargeError) {
      const chargeMessage = chargeError instanceof Error ? chargeError.message : "Quill consumption failed";
      if (chargeMessage.includes("INSUFFICIENT_QUILLS")) {
        return errorResponse("INSUFFICIENT_QUILLS", 402);
      }
      console.error("[extract-knowledge] Quill consumption failed after successful persistence:", chargeMessage);
      return errorResponse("Failed to update Quill balance", 500, chargeMessage);
    }

    // ==============================
    // Step 8: Return result
    // ==============================
    const done = chunks.length < limit;

    return new Response(
      JSON.stringify({
        success: true,
        done,
        next_offset: offset + limit,
        telemetry: {
          model: modelUsed,
          model_profile: modelProfile,
          extraction_strategy: extractionStrategy,
          expert_models: expertModels,
          input_tokens: (usage as Record<string, unknown>).promptTokenCount ?? null,
          output_tokens: (usage as Record<string, unknown>).candidatesTokenCount ?? null,
          thinking_tokens: (usage as Record<string, unknown>).thoughtsTokenCount ?? null,
          total_tokens: quillCharge.totalTokens,
          cached_tokens: (usage as Record<string, unknown>).cachedContentTokenCount ?? null,
          latency_ms: latencyMs,
          chunks_sent: chunks.length,
          total_chars: totalChars,
          extracted_item_count: extractedItemCount,
          persisted_item_count: persistedItemCount,
          chunk_fetch_latency_ms: chunkFetchLatencyMs,
          prompt_build_latency_ms: promptBuildLatencyMs,
          persistence_latency_ms: persistenceLatencyMs,
          pipeline_latency_ms: pipelineLatencyMs,
          total_latency_ms: Date.now() - requestStartedAt,
        },
        quills: {
          quills_balance: quillCharge.balance,
          token_remainder: quillCharge.remainder,
          charged_quills: quillCharge.chargedQuills,
          total_tokens: quillCharge.totalTokens,
        },
        summary: {
          entities_saved: entitiesSaved,
          mentions_saved: mentionsSaved,
          aliases_saved: aliasesSaved,
          relationships_saved: relationshipsSaved,
          ability_relationships_saved: abilityRelationshipsSaved,
          ability_relationship_errors: abilityRelationshipErrors.length > 0 ? abilityRelationshipErrors : undefined,
          events_saved: eventsSaved,
          event_mentions_saved: eventMentionsSaved,
          event_participants_saved: eventParticipantsSaved,
          branch_entities_saved: branchEntitiesSaved,
          values_synced: valuesSynced,
          value_evidence_synced: valueEvidenceSynced,
          raw_extraction_id: rawExtractionId,
          quills_charged: quillCharge.chargedQuills,
          quills_balance: quillCharge.balance,
          token_remainder: quillCharge.remainder,
          branch_id: targetBranchId || null,
          layer: targetLayer,
          normalized_entity_count: normalizedEntities.length,
          persisted_items_saved: persistedItemCount,
          value_sync_errors: valueSyncErrors.length > 0 ? valueSyncErrors : undefined,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("extract-knowledge error:", message);
    return errorResponse(`Edge Function error: ${message}`, 500);
  }
});
