// ============================================
// Value Synchronization Helper
// Writes canonical values from extraction to knowledge_entity_values
// Maintains user-over-AI precedence and Main/Branch semantics
// ============================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  FieldEvidenceMap,
  FieldObservationMap,
  NormalizedFieldObservation,
} from "./field-provenance.ts";

import { buildValueWritePlan } from "./value-write-plan.ts";
import { ENTITY_TYPE_DEFINITIONS } from "./rules/extraction.ts";
import { CHARACTER_FIELD_KEYS } from "./character-specialist.ts";

/**
 * The field paths `syncEntityValues` is permitted to write to
 * `knowledge_entity_values` for a given entity type.
 *
 * Authoritative source (no new taxonomy is invented here):
 * - the per-entity-type `fields` catalogue in `rules/extraction.ts`
 * - for `character`, the static Sub-base C character field keys
 *   (`CHARACTER_FIELD_KEYS`)
 * - this project's active dynamic Character/Location field-definition keys,
 *   passed in by the caller
 * - `name` / `description`
 *
 * Returns `null` for entity types with no catalogue entry (e.g. `organization`,
 * `event`); callers leave those unfiltered so persistence behaviour outside the
 * catalogued types is unchanged.
 */
export function persistableFieldPaths(
  entityType: string,
  activeDynamicFieldKeys: readonly string[] = [],
): Set<string> | null {
  const catalogue = ENTITY_TYPE_DEFINITIONS[entityType]?.fields;
  if (!catalogue) return null;
  const allowed = new Set<string>(["name", "description"]);
  for (const field of catalogue) allowed.add(field);
  if (entityType === "character") {
    for (const field of CHARACTER_FIELD_KEYS) allowed.add(field);
  }
  for (const field of activeDynamicFieldKeys) allowed.add(field);
  return allowed;
}

/**
 * Drops any field path not permitted for this entity type (see
 * `persistableFieldPaths`). Pure: returns a new object. Entity types with no
 * catalogue entry are returned as a shallow copy, unfiltered.
 */
export function filterToPersistableFields(
  fieldValues: Record<string, unknown>,
  entityType: string,
  activeDynamicFieldKeys: readonly string[] = [],
): Record<string, unknown> {
  const allowed = persistableFieldPaths(entityType, activeDynamicFieldKeys);
  if (!allowed) return { ...fieldValues };
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  return filtered;
}

export interface SyncValueRequest {
  supabase: SupabaseClient<any, "public", any>;
  entityId: string;
  projectId: string;
  userId: string;
  rawExtractionId: string;
  branchId: string | null;
  /**
   * Active project-dynamic field-definition keys for this entity's type
   * (Character or Location). Extends the static `rules/extraction.ts` catalogue
   * used by `filterToPersistableFields`. Empty / omitted for types without a
   * dynamic catalogue.
   */
  activeDynamicFieldKeys?: readonly string[];
  normalizedEntity: {
    canonical_name: string;
    entity_type: string;
    description: string | null;
    structured_fields: Record<string, unknown>;
    attributes: Record<string, unknown>;
    evidence: string[];
    chunk_positions: number[];
    field_evidence?: FieldEvidenceMap;
    field_confidence?: Record<string, number>;
    field_observations?: FieldObservationMap;
    field_inferred?: Record<string, boolean>;
    field_inference_notes?: Record<string, string | null>;
  };
}

/**
 * Sync AI-extracted values to knowledge_entity_values.
 * User-authored values are never overwritten by AI.
 * AI values can be updated by newer extractions.
 */
export async function syncEntityValues(req: SyncValueRequest): Promise<{
  valuesSynced: number;
  evidenceSynced: number;
  errors: string[];
}> {
  const { supabase, entityId, projectId, userId, rawExtractionId, branchId, normalizedEntity, activeDynamicFieldKeys = [] } = req;
  const errors: string[] = [];
  let valuesSynced = 0;
  let evidenceSynced = 0;

  // Combine canonical fields while excluding internal provenance metadata from
  // becoming user-visible Knowledge values. Provenance is persisted through the
  // dedicated observation/evidence metadata below.
  const excludedAttributeKeys = new Set([
    "extraction_meta",
    "character_field_observations",
    "character_fields",
    "location_fields",
  ]);
  const allFieldValues: Record<string, unknown> = {
    ...normalizedEntity.structured_fields,
  };
  for (const [field, value] of Object.entries(normalizedEntity.attributes)) {
    if (!excludedAttributeKeys.has(field)) allFieldValues[field] = value;
  }

  // Special handling for description/name.
  if (normalizedEntity.description) allFieldValues.description = normalizedEntity.description;
  if (normalizedEntity.canonical_name) allFieldValues.name = normalizedEntity.canonical_name;

  // Character observations can contain a field that is not represented in the
  // legacy structured_fields shape. Include its primary value without allowing
  // internal metadata to become a field.
  for (const [field, observations] of Object.entries(normalizedEntity.field_observations || {})) {
    if (!excludedAttributeKeys.has(field) && allFieldValues[field] === undefined && observations[0]) {
      allFieldValues[field] = observations[0].value;
    }
  }

  // Issue 14: restrict the AI write set to this entity type's authoritative field
  // catalogue (`rules/extraction.ts`) plus the project's active dynamic field
  // keys. Internal / relational attributes (`users`, `members`, `purpose`,
  // `relationship_labels`, …) never become user-visible Knowledge values. This
  // only narrows what AI writes — it issues no deletes and never touches an
  // existing user-authored value; user-over-AI precedence and Main/Branch
  // scoping are still enforced downstream by `buildValueWritePlan`.
  const persistableFieldValues = filterToPersistableFields(
    allFieldValues,
    normalizedEntity.entity_type,
    activeDynamicFieldKeys,
  );

  const normalizeValue = (value: unknown): string => {
    if (typeof value === "string") return value.toLowerCase().trim();
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return String(value).toLowerCase();
    }
  };

  const observationsForField = (
    fieldPath: string,
    value: unknown,
  ): NormalizedFieldObservation[] => {
    const observations = normalizedEntity.field_observations?.[fieldPath];
    if (observations && observations.length > 0) return observations;
    return [{
      value,
      evidence: normalizedEntity.field_evidence?.[fieldPath] || [],
      confidence: normalizedEntity.field_confidence?.[fieldPath] ?? null,
      inferred: normalizedEntity.field_inferred?.[fieldPath] ?? false,
      inference_note: normalizedEntity.field_inference_notes?.[fieldPath] ?? null,
    }];
  };

  const persistEvidence = async (
    valueId: string,
    fieldPath: string,
    fieldEvidence: FieldEvidenceMap[string] | undefined,
  ): Promise<void> => {
    const references = fieldEvidence && fieldEvidence.length > 0
      ? fieldEvidence
      : normalizedEntity.evidence.length > 0
        ? normalizedEntity.evidence.slice(0, 1).map((quote) => ({
          quote,
          chunk_position: null,
          chunk_id: null,
          page: null,
          position_start: null,
          position_end: null,
        }))
        : normalizedEntity.chunk_positions.slice(0, 1).map((chunk_position) => ({
          quote: `Extracted from chunk ${chunk_position}`,
          chunk_position,
          chunk_id: null,
          page: null,
          position_start: null,
          position_end: null,
        }));

    for (const reference of references) {
      const quote = reference.quote?.slice(0, 1000)
        || (reference.chunk_position === null ? `Extracted field: ${fieldPath}` : `Extracted from chunk ${reference.chunk_position}`);
      const { error: evidenceError } = await supabase
        .from("knowledge_entity_value_evidence")
        .insert({
          value_id: valueId,
          chunk_id: reference.chunk_id,
          quote,
          position_start: reference.position_start,
          position_end: reference.position_end,
          page_number: reference.page,
          raw_extraction_id: rawExtractionId,
        });
      if (evidenceError) {
        errors.push(`Failed to link evidence for ${fieldPath}: ${evidenceError.message}`);
      } else {
        evidenceSynced++;
      }
    }
  };

  // Process each field that has a value.
  for (const [fieldPath, value] of Object.entries(persistableFieldValues)) {
    if (value === null || value === undefined) continue;

    const observations = observationsForField(fieldPath, value)
      .filter((observation) => observation.value !== null && observation.value !== undefined)
      .filter((observation, index, all) => normalizeValue(observation.value) !== ""
        && all.findIndex((candidate) => normalizeValue(candidate.value) === normalizeValue(observation.value)) === index);
    if (observations.length === 0) continue;

    let existingValuesQuery = supabase
      .from("knowledge_entity_values")
      .select("id, source_type, value_status")
      .eq("entity_id", entityId)
      .eq("field_path", fieldPath)
      .eq("value_status", "active");
    existingValuesQuery = branchId
      ? existingValuesQuery.eq("branch_id", branchId)
      : existingValuesQuery.is("branch_id", null);

    const { data: existingValues, error: checkError } = await existingValuesQuery;
    if (checkError) {
      errors.push(`Failed to check existing value for ${fieldPath}: ${checkError.message}`);
      continue;
    }

    // Issue 2: in Branch context a user-authored value on Main (branch_id IS
    // NULL) also makes this field user-owned. Detect it with a dedicated
    // lookup so AI supersession stays scoped to the current Branch and never
    // touches a Main row.
    let mainUserOwned = false;
    if (branchId) {
      const { data: mainUserValues, error: mainUserError } = await supabase
        .from("knowledge_entity_values")
        .select("id")
        .eq("entity_id", entityId)
        .eq("field_path", fieldPath)
        .eq("value_status", "active")
        .eq("source_type", "user")
        .is("branch_id", null);
      if (mainUserError) {
        errors.push(`Failed to check Main user value for ${fieldPath}: ${mainUserError.message}`);
        continue;
      }
      mainUserOwned = (mainUserValues || []).length > 0;
    }

    const plan = buildValueWritePlan(existingValues || [], observations);
    if (plan.skip || mainUserOwned) continue;

    for (const valueId of plan.supersede_ids) {
      await supabase
        .from("knowledge_entity_values")
        .update({ value_status: "superseded" })
        .eq("id", valueId);
    }

    const conflictGroup = plan.writes.length > 1
      ? `${rawExtractionId}:${entityId}:${fieldPath}`
      : null;
    let primaryValueId: string | null = null;
    for (const [observationIndex, write] of plan.writes.entries()) {
      const observation = write.observation;
      const value = observation.value;
      const valueJson = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? { value }
        : value;
      const normalized = normalizeValue(value);
      const confidence = observation.confidence
        ?? normalizedEntity.field_confidence?.[fieldPath]
        ?? calculateFieldConfidence(fieldPath, value, normalizedEntity);
      const isPrimary = write.value_status === "active";
      const metadata = {
        inferred: observation.inferred,
        inference_note: observation.inference_note,
        conflict_group: conflictGroup,
        observation_index: observationIndex,
        observation_count: plan.writes.length,
      };

      const insertResult = await supabase
        .from("knowledge_entity_values")
        .insert({
          project_id: projectId,
          entity_id: entityId,
          branch_id: branchId,
          field_path: fieldPath,
          value_json: valueJson,
          metadata,
          normalized_value: normalized,
          source_type: "ai",
          value_status: write.value_status,
          confidence,
          raw_extraction_id: rawExtractionId,
          supersedes_value_id: write.supersedes_value_id ?? primaryValueId,
          created_by: userId,
        })
        .select("id")
        .single();
      const newValue = insertResult.data as { id: string } | null;
      const insertError = insertResult.error;

      if (insertError || !newValue) {
        errors.push(`Failed to insert value for ${fieldPath}: ${insertError?.message || "no row returned"}`);
        continue;
      }

      valuesSynced++;
      if (isPrimary) primaryValueId = newValue.id;
      await persistEvidence(newValue.id, fieldPath, observation.evidence);
    }
  }

  return { valuesSynced, evidenceSynced, errors };
}

/**
 * Calculate confidence score based on meaningful signals of extraction quality.
 * 
 * Signals considered:
 * 1. Field type objectivity (objective fields get higher confidence)
 * 2. Evidence existence and quality (supported by text > inferred)
 * 3. Evidence count (multiple sources > single source)
 * 4. Value specificity (concrete > vague)
 * 5. Contradiction detection (conflicting evidence = lower confidence)
 * 6. Field completeness (fields with many populated values = higher confidence)
 * 
 * IMPORTANT: Confidence must reflect EXTRACTION QUALITY, not user preference.
 * A value is only confident if there's real textual evidence for it.
 */
function calculateFieldConfidence(
  fieldPath: string,
  value: unknown,
  entity: SyncValueRequest["normalizedEntity"]
): number {
  // Early return: null/undefined values have minimal confidence
  if (value === null || value === undefined || value === "") {
    return 0.3;
  }

  let confidence = 0.5; // Base confidence
  let signals: string[] = [];

  // SIGNAL 1: Field type objectivity
  // Objective, verifiable fields get higher base confidence
  const objectiveFields = new Set([
    "age", "height", "weight", "birth_year", "death_year",
    "location_type", "object_type", "ability_type",
    "eye_color", "hair_color", "gender", "name"
  ]);

  const subjectiveFields = new Set([
    "personality", "motivation", "goals", "fears",
    "narrative_impact", "narrative_importance", "significance",
    "description", "appearance"
  ]);

  if (objectiveFields.has(fieldPath)) {
    confidence = 0.75;
    signals.push("objective_field");
  } else if (subjectiveFields.has(fieldPath)) {
    confidence = 0.55;
    signals.push("subjective_field");
  } else {
    confidence = 0.65;
    signals.push("neutral_field");
  }

  // SIGNAL 2: Evidence existence
  // Field-specific evidence is stronger than generic evidence
  const hasFieldEvidence = entity.field_evidence?.[fieldPath] && entity.field_evidence[fieldPath].length > 0;
  const hasGenericEvidence = entity.evidence && entity.evidence.length > 0;

  if (hasFieldEvidence) {
    confidence += 0.15;
    signals.push("field_evidence");
  } else if (!hasGenericEvidence && !objectiveFields.has(fieldPath)) {
    // No evidence and not objective = low confidence
    confidence -= 0.15;
    signals.push("no_evidence");
  }

  // SIGNAL 3: Evidence count
  // Multiple independent sources increase confidence
  const fieldEvidenceCount = entity.field_evidence?.[fieldPath]?.length || 0;
  const genericEvidenceCount = entity.evidence?.length || 0;
  const totalEvidenceCount = Math.max(fieldEvidenceCount, genericEvidenceCount);

  if (totalEvidenceCount >= 3) {
    confidence = Math.min(0.95, confidence + 0.1);
    signals.push("multiple_evidence");
  } else if (totalEvidenceCount >= 2) {
    confidence = Math.min(0.9, confidence + 0.05);
    signals.push("dual_evidence");
  } else if (totalEvidenceCount === 0 && !objectiveFields.has(fieldPath)) {
    confidence = Math.max(0.3, confidence - 0.1);
    signals.push("single_source");
  }

  // SIGNAL 4: Value specificity
  // Concrete values > vague values
  if (typeof value === "string") {
    const lowerValue = value.toLowerCase().trim();

    // Generic/vague indicators
    const genericTerms = [
      "unknown", "unclear", "various", "multiple", "n/a", "not specified",
      "presumably", "possibly", "maybe", "seems", "appears", "?", "..."
    ];
    const isGeneric = genericTerms.some(term => lowerValue.includes(term));

    if (isGeneric) {
      confidence *= 0.7;
      signals.push("generic_value");
    } else if (lowerValue.length > 15) {
      // Long, specific descriptions suggest more careful extraction
      confidence = Math.min(0.95, confidence + 0.05);
      signals.push("specific_value");
    }

    // Single words for descriptive fields = suspicious
    if (subjectiveFields.has(fieldPath) && lowerValue.split(" ").length === 1) {
      confidence *= 0.85;
      signals.push("single_word_subjective");
    }
  }

  // SIGNAL 5: Contradiction detection
  // If description contains contradictory terms, lower confidence
  if (fieldPath === "description" || fieldPath === "narrative_role") {
    if (typeof value === "string") {
      const contradictionMarkers = [
        ["good", "evil"],
        ["kind", "cruel"],
        ["brave", "coward"],
        ["light", "dark"],
        ["begins", "ends"],
        ["young", "old"],
        ["strong", "weak"]
      ];

      let hasContradiction = false;
      for (const [term1, term2] of contradictionMarkers) {
        if (value.toLowerCase().includes(term1) && value.toLowerCase().includes(term2)) {
          hasContradiction = true;
          break;
        }
      }

      if (hasContradiction) {
        confidence *= 0.8;
        signals.push("contradictory_terms");
      }
    }
  }

  // SIGNAL 6: Field completeness
  // Entities with many populated fields suggest more reliable extraction overall
  const populatedFields = Object.values(entity.structured_fields).filter(v => v != null && v !== "").length;
  const totalFields = Object.keys(entity.structured_fields).length;

  if (totalFields > 0) {
    const completeness = populatedFields / totalFields;
    if (completeness > 0.7) {
      confidence = Math.min(0.95, confidence + 0.05);
      signals.push("high_entity_completeness");
    } else if (completeness < 0.3) {
      confidence = Math.max(0.3, confidence - 0.1);
      signals.push("low_entity_completeness");
    }
  }

  // Ensure confidence is in valid range [0.1, 0.95]
  confidence = Math.max(0.1, Math.min(0.95, confidence));

  // Round to 2 decimal places
  const finalConfidence = Math.round(confidence * 100) / 100;

  console.log(`[confidence] Field "${fieldPath}": ${finalConfidence} (${signals.join(", ")})`);
  return finalConfidence;
}
