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

    // Check if a value for this entity/field already exists
    const { data: existingValues, error: checkError } = await supabase
      .from("knowledge_entity_values")
      .select("id, source_type, value_status")
      .eq("entity_id", entityId)
      .eq("field_path", fieldPath)
      .eq("value_status", "active");

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
        confidence: 0.8, // Default confidence for AI values
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

    // Link evidence to the value
    // For now, attach all evidence from the extraction to this value
    // In a more sophisticated implementation, we could parse which evidence applies to which field
    if (normalizedEntity.evidence.length > 0) {
      for (const quote of normalizedEntity.evidence) {
        const { error: evidenceError } = await supabase
          .from("knowledge_entity_value_evidence")
          .insert({
            value_id: valueId,
            chunk_id: null, // Could be populated if we tracked chunk origins
            quote: quote.slice(0, 1000),
            raw_extraction_id: rawExtractionId,
          });

        if (evidenceError) {
          errors.push(`Failed to link evidence for ${fieldPath}: ${evidenceError.message}`);
        } else {
          evidenceSynced++;
        }
      }
    }

    // If no evidence text but we have chunk positions, create minimal evidence
    if (normalizedEntity.evidence.length === 0 && normalizedEntity.chunk_positions.length > 0) {
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
