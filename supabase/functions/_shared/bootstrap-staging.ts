// ============================================
// Bootstrap Staging Operations
// Manages safe bootstrap by staging entities before committing to Main
// ============================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Initialize a bootstrap stage for an extraction run.
 * Must be called before creating any entities in bootstrap mode.
 */
export async function initializeBootstrapStage(
  supabase: SupabaseClient<any, "public", any>,
  projectId: string,
  userId: string,
  extractionRunId: string,
  documentId: string,
  versionId: string,
  totalBatches: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("bootstrap_stages")
    .insert({
      project_id: projectId,
      user_id: userId,
      extraction_run_id: extractionRunId,
      document_id: documentId,
      version_id: versionId,
      status: "in_progress",
      total_batches: totalBatches,
      completed_batches: 0,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to initialize bootstrap stage: ${error.message}`);
  }

  console.log(`[bootstrap] Stage initialized: ${data.id} for run ${extractionRunId}`);
  return data.id;
}

/**
 * Get an existing bootstrap stage by extraction run ID.
 * Used on subsequent batches to find the stage.
 */
export async function getBootstrapStage(
  supabase: SupabaseClient<any, "public", any>,
  extractionRunId: string,
): Promise<{ id: string; status: string; completed_batches: number; total_batches: number } | null> {
  const { data, error } = await supabase
    .from("bootstrap_stages")
    .select("id, status, completed_batches, total_batches")
    .eq("extraction_run_id", extractionRunId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (error) {
    console.error(`[bootstrap] Failed to get stage: ${error.message}`);
    return null;
  }

  return data;
}

/**
 * Stage an entity during bootstrap.
 * Entity is not yet in knowledge_entities; it's in bootstrap_entity_staging.
 * Will be promoted to Main after bootstrap completes.
 */
export async function stageEntity(
  supabase: SupabaseClient<any, "public", any>,
  bootstrapStageId: string,
  projectId: string,
  userId: string,
  documentId: string,
  versionId: string,
  canonicalName: string,
  entityType: string,
  entityTypes: string[],
  description: string | null,
  attributes: Record<string, unknown>,
  structuredFields: Record<string, unknown>,
  rawExtractionId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("bootstrap_entity_staging")
    .insert({
      bootstrap_stage_id: bootstrapStageId,
      project_id: projectId,
      user_id: userId,
      document_id: documentId,
      version_id: versionId,
      canonical_name: canonicalName,
      entity_type: entityType,
      entity_types: entityTypes,
      description,
      attributes,
      structured_fields: structuredFields,
      source: "ai",
      raw_extraction_id: rawExtractionId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to stage entity: ${error.message}`);
  }

  return data.id;
}

/**
 * Mark a batch as completed in the bootstrap stage.
 * Called after each batch succeeds.
 */
export async function completeBatch(
  supabase: SupabaseClient<any, "public", any>,
  bootstrapStageId: string,
): Promise<void> {
  const { error } = await supabase
    .from("bootstrap_stages")
    .update({ completed_batches: supabase.rpc("increment_counter", { }) })
    .eq("id", bootstrapStageId);

  // Simpler approach without RPC:
  const { data: current } = await supabase
    .from("bootstrap_stages")
    .select("completed_batches")
    .eq("id", bootstrapStageId)
    .single();

  if (current) {
    await supabase
      .from("bootstrap_stages")
      .update({ completed_batches: (current.completed_batches || 0) + 1 })
      .eq("id", bootstrapStageId);
  }

  console.log(`[bootstrap] Batch completed for stage ${bootstrapStageId}`);
}

/**
 * Mark bootstrap as completed and promote staged entities to Main.
 * Only called after ALL batches have succeeded.
 */
export async function promoteBootstrapToMain(
  supabase: SupabaseClient<any, "public", any>,
  bootstrapStageId: string,
): Promise<number> {
  // Update stage status
  await supabase
    .from("bootstrap_stages")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", bootstrapStageId);

  // Fetch all staged entities
  const { data: stagedEntities, error: fetchError } = await supabase
    .from("bootstrap_entity_staging")
    .select("*")
    .eq("bootstrap_stage_id", bootstrapStageId);

  if (fetchError) {
    throw new Error(`Failed to fetch staged entities: ${fetchError.message}`);
  }

  if (!stagedEntities || stagedEntities.length === 0) {
    console.log(`[bootstrap] No staged entities to promote`);
    return 0;
  }

  // Promote each staged entity to Main
  let promoted = 0;
  for (const staged of stagedEntities) {
    const { error: insertError } = await supabase
      .from("knowledge_entities")
      .insert({
        project_id: staged.project_id,
        user_id: staged.user_id,
        document_id: staged.document_id,
        version_id: staged.version_id,
        canonical_name: staged.canonical_name,
        entity_type: staged.entity_type,
        entity_types: staged.entity_types,
        description: staged.description,
        attributes: staged.attributes,
        structured_fields: staged.structured_fields,
        source: staged.source,
        layer: "main", // CRITICAL: Promoted to Main layer
        raw_extraction_id: staged.raw_extraction_id,
      });

    if (insertError) {
      console.error(`[bootstrap] Failed to promote entity ${staged.canonical_name}: ${insertError.message}`);
    } else {
      promoted++;
    }
  }

  console.log(`[bootstrap] Promoted ${promoted} entities to Main`);
  return promoted;
}

/**
 * Mark bootstrap as failed.
 * Prevents staged entities from being promoted.
 */
export async function failBootstrap(
  supabase: SupabaseClient<any, "public", any>,
  bootstrapStageId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from("bootstrap_stages")
    .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", bootstrapStageId);

  console.log(`[bootstrap] Bootstrap stage marked as failed: ${errorMessage}`);
}

/**
 * Rollback a failed bootstrap by deleting staged entities.
 */
export async function rollbackBootstrap(
  supabase: SupabaseClient<any, "public", any>,
  bootstrapStageId: string,
): Promise<number> {
  const { data: stagedCount } = await supabase
    .from("bootstrap_entity_staging")
    .select("id", { count: "exact" })
    .eq("bootstrap_stage_id", bootstrapStageId);

  const count = stagedCount?.length || 0;

  await supabase
    .from("bootstrap_entity_staging")
    .delete()
    .eq("bootstrap_stage_id", bootstrapStageId);

  await supabase
    .from("bootstrap_stages")
    .update({ status: "rolled_back", completed_at: new Date().toISOString() })
    .eq("id", bootstrapStageId);

  console.log(`[bootstrap] Rolled back ${count} staged entities`);
  return count;
}

/**
 * Check if a bootstrap is complete and ready for promotion.
 */
export function isBootstrapComplete(
  stage: { completed_batches: number; total_batches: number | null },
): boolean {
  if (!stage.total_batches) return false;
  return stage.completed_batches >= stage.total_batches;
}
