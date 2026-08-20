// ============================================
// Value Synchronization Helper
// Writes canonical values from extraction to knowledge_entity_values
// Maintains user-over-AI precedence and Main/Branch semantics
// ============================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SyncValueRequest {
  supabase: SupabaseClient<any, "public", any>;
  entityId: string;
  projectId: string;
  userId: string;
  rawExtractionId: string;
  branchId: string | null;
  normalizedEntity: {
    canonical_name: string;
    entity_type: string;
    description: string | null;
    structured_fields: Record<string, unknown>;
    attributes: Record<string, unknown>;
    evidence: string[];
    chunk_positions: number[];
    // NEW: Field-specific evidence mapping
    field_evidence?: Record<string, string[]>;
    // NEW: Confidence scores per field (0-1)
    field_confidence?: Record<string, number>;
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
  const { supabase, entityId, projectId, userId, rawExtractionId, branchId, normalizedEntity } = req;
  const errors: string[] = [];
  let valuesSynced = 0;
  let evidenceSynced = 0;

  // Combine all value fields from structured_fields and attributes
  const allFieldValues: Record<string, unknown> = {
    ...normalizedEntity.structured_fields,
    ...normalizedEntity.attributes,
  };

  // Special handling for description/name
  if (normalizedEntity.description) {
    allFieldValues.description = normalizedEntity.description;
  }
  if (normalizedEntity.canonical_name) {
    allFieldValues.name = normalizedEntity.canonical_name;
  }

  // Process each field that has a value
  for (const [fieldPath, value] of Object.entries(allFieldValues)) {
    if (value === null || value === undefined) {
      continue; // Skip nulls
    }

    // Normalize the value to JSON
    const valueJson = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? { value }
      : value;

    // Normalize for deduplication (simplified: convert to lowercase string)
    const normalized = typeof value === "string"
      ? value.toLowerCase().trim()
      : JSON.stringify(value).toLowerCase();

    // Check if a value for this entity/field already exists in the same
    // Main/Branch scope. A Branch value must never supersede Main history.
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

    // User-authored values take precedence: skip if user value exists
    const hasUserValue = existingValues?.some(v => v.source_type === "user");
    if (hasUserValue) {
      continue; // Don't overwrite user values
    }

    // If AI value exists, mark it as superseded (preserve history)
    const existingAiValue = existingValues?.find(v => v.source_type === "ai");
    if (existingAiValue) {
      await supabase
        .from("knowledge_entity_values")
        .update({ value_status: "superseded" })
        .eq("id", existingAiValue.id);
    }

    // CRITICAL FIX: Use field-specific confidence if available, otherwise calculate
    const confidence = normalizedEntity.field_confidence?.[fieldPath] 
      ?? calculateFieldConfidence(fieldPath, value, normalizedEntity);

    // Insert new AI value
    const { data: newValue, error: insertError } = await supabase
      .from("knowledge_entity_values")
      .insert({
        project_id: projectId,
        entity_id: entityId,
        branch_id: branchId,
        field_path: fieldPath,
        value_json: valueJson,
        normalized_value: normalized,
        source_type: "ai",
        value_status: "active",
        confidence,
        raw_extraction_id: rawExtractionId,
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !newValue) {
      errors.push(`Failed to insert value for ${fieldPath}: ${insertError?.message}`);
      continue;
    }

    valuesSynced++;
    const valueId = newValue.id;

    // CRITICAL FIX: Link field-specific evidence only
    const fieldEvidence = normalizedEntity.field_evidence?.[fieldPath] || [];
    
    if (fieldEvidence.length > 0) {
      // Use field-specific evidence
      for (const quote of fieldEvidence) {
        const { error: evidenceError } = await supabase
          .from("knowledge_entity_value_evidence")
          .insert({
            value_id: valueId,
            chunk_id: null, // TODO: Populate from extraction context
            quote: quote.slice(0, 1000),
            raw_extraction_id: rawExtractionId,
          });

        if (evidenceError) {
          errors.push(`Failed to link evidence for ${fieldPath}: ${evidenceError.message}`);
        } else {
          evidenceSynced++;
        }
      }
    } else if (normalizedEntity.evidence.length > 0) {
      // Fallback: Use first evidence as general support (less precise)
      // This maintains backward compatibility when field_evidence is not provided
      const quote = normalizedEntity.evidence[0];
      if (quote) {
        const { error: evidenceError } = await supabase
          .from("knowledge_entity_value_evidence")
          .insert({
            value_id: valueId,
            chunk_id: null,
            quote: quote.slice(0, 1000),
            raw_extraction_id: rawExtractionId,
          });

        if (!evidenceError) {
          evidenceSynced++;
        }
      }
    }

    // If no evidence text but we have chunk positions, create minimal evidence
    if (fieldEvidence.length === 0 && normalizedEntity.evidence.length === 0 && normalizedEntity.chunk_positions.length > 0) {
      const { error: evidenceError } = await supabase
        .from("knowledge_entity_value_evidence")
        .insert({
          value_id: valueId,
          chunk_id: null,
          quote: `Extracted from chunks: ${normalizedEntity.chunk_positions.join(", ")}`,
          raw_extraction_id: rawExtractionId,
        });

      if (!evidenceError) {
        evidenceSynced++;
      }
    }
  }

  return { valuesSynced, evidenceSynced, errors };
}

/**
 * Calculate confidence score based on field type and value characteristics.
 * Fields with specific, verifiable values get higher confidence.
 * Fields with vague or subjective values get lower confidence.
 */
function calculateFieldConfidence(
  fieldPath: string,
  value: unknown,
  entity: SyncValueRequest["normalizedEntity"]
): number {
  // Base confidence
  let confidence = 0.7;

  // High-confidence fields (objective, verifiable)
  const highConfidenceFields = [
    "age", "height", "weight", "birth_year", "death_year",
    "location_type", "object_type", "ability_type",
    "eye_color", "hair_color", "gender"
  ];
  
  // Medium-confidence fields (somewhat subjective)
  const mediumConfidenceFields = [
    "occupation", "role", "status", "allegiance",
    "power_level", "magic_system", "country", "city", "region"
  ];
  
  // Lower-confidence fields (highly subjective or narrative-dependent)
  const lowConfidenceFields = [
    "personality", "motivation", "goals", "fears",
    "narrative_impact", "narrative_importance", "significance"
  ];

  if (highConfidenceFields.includes(fieldPath)) {
    confidence = 0.85;
  } else if (mediumConfidenceFields.includes(fieldPath)) {
    confidence = 0.75;
  } else if (lowConfidenceFields.includes(fieldPath)) {
    confidence = 0.6;
  }

  // Boost confidence if multiple evidence sources
  const evidenceCount = entity.field_evidence?.[fieldPath]?.length || entity.evidence.length;
  if (evidenceCount >= 3) {
    confidence = Math.min(0.95, confidence + 0.1);
  } else if (evidenceCount >= 2) {
    confidence = Math.min(0.9, confidence + 0.05);
  }

  // Reduce confidence if value is null-like or generic
  if (typeof value === "string") {
    const lowerValue = value.toLowerCase().trim();
    const genericTerms = ["unknown", "unclear", "various", "multiple", "n/a", "not specified"];
    if (genericTerms.some(term => lowerValue.includes(term))) {
      confidence *= 0.7;
    }
  }

  return Math.round(confidence * 100) / 100; // Round to 2 decimal places
}
