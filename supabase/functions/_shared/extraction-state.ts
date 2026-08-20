// ============================================
// Extraction State Management
// Tracks entities and resolutions across batches within the same extraction run
// ============================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeKey, stripNikud } from "./rules/normalization.ts";

/**
 * State for a single extraction run (all batches for one extraction).
 * Stored in a temporary table or cache to enable cross-batch resolution.
 */
export interface ExtractionRunState {
  extraction_run_id: string;
  project_id: string;
  document_id: string;
  version_id: string;
  user_id: string;
  extraction_mode: 'bootstrap' | 'branch';
  target_branch_id: string | null;
  // Entities created by this run (by batch)
  created_entities: Map<string, CreatedEntity>;
  // Batches processed
  batches_processed: number;
  // Timestamp
  created_at: Date;
}

/**
 * Entity created during extraction, tracking its batch origin
 */
export interface CreatedEntity {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  batch_number: number;
  chunk_positions: number[];
  aliases: string[];
  description: string | null;
}

/**
 * Store extraction run state for cross-batch resolution.
 * For MVP, store in a JSON column in raw_extractions or a dedicated temp table.
 * This enables Batch N to resolve entities from Batches 1-N-1.
 */
export async function initializeExtractionState(
  supabase: SupabaseClient<any, "public", any>,
  extractionRunId: string,
  projectId: string,
  documentId: string,
  versionId: string,
  userId: string,
  extractionMode: 'bootstrap' | 'branch',
  targetBranchId: string | null,
): Promise<ExtractionRunState> {
  return {
    extraction_run_id: extractionRunId,
    project_id: projectId,
    document_id: documentId,
    version_id: versionId,
    user_id: userId,
    extraction_mode: extractionMode,
    target_branch_id: targetBranchId,
    created_entities: new Map(),
    batches_processed: 0,
    created_at: new Date(),
  };
}

/**
 * Record that an entity was created in this batch.
 * Used for cross-batch resolution in subsequent batches.
 */
export function recordCreatedEntity(
  state: ExtractionRunState,
  entityId: string,
  canonicalName: string,
  entityType: string,
  batchNumber: number,
  chunkPositions: number[],
  aliases: string[],
  description: string | null,
): void {
  const key = `${normalizeKey(canonicalName)}::${entityType}`;
  state.created_entities.set(key, {
    entity_id: entityId,
    canonical_name: canonicalName,
    entity_type: entityType,
    batch_number: batchNumber,
    chunk_positions: chunkPositions,
    aliases,
    description,
  });
}

/**
 * Find an entity created earlier in this extraction run.
 * Used by Batch N to resolve against entities from Batches 1 to N-1.
 * Conservative: only matches on strong signals.
 */
export function findPriorBatchEntity(
  state: ExtractionRunState,
  canonicalName: string,
  entityType: string,
  currentBatchNumber: number,
): CreatedEntity | null {
  // Direct match on normalized key
  const key = `${normalizeKey(canonicalName)}::${entityType}`;
  const direct = state.created_entities.get(key);
  if (direct && direct.batch_number < currentBatchNumber) {
    return direct;
  }

  // Check aliases of earlier entities
  for (const [k, entity] of state.created_entities) {
    if (entity.batch_number >= currentBatchNumber) continue; // Only earlier batches
    if (entity.entity_type !== entityType) continue;

    const incomingKey = normalizeKey(canonicalName);
    const entityKey = normalizeKey(entity.canonical_name);

    // Exact normalized match
    if (incomingKey === entityKey) {
      return entity;
    }

    // Check if incoming is an alias
    for (const alias of entity.aliases) {
      if (normalizeKey(alias) === incomingKey) {
        return entity;
      }
    }

    // Check if incoming name is a prefix of entity (e.g., "Leo" vs "Leo Frost")
    // Only if entity is longer (conservative)
    const incomingNorm = stripNikud(canonicalName).trim().toLowerCase();
    const entityNorm = stripNikud(entity.canonical_name).trim().toLowerCase();

    if (
      entityNorm.length > incomingNorm.length &&
      (entityNorm.startsWith(incomingNorm + " ") ||
        entityNorm.startsWith(incomingNorm + "'") ||
        entityNorm.startsWith(incomingNorm + '"'))
    ) {
      return entity;
    }
  }

  return null;
}

/**
 * Get all entities created in this extraction run (for final stats).
 */
export function getCreatedEntities(state: ExtractionRunState): CreatedEntity[] {
  return Array.from(state.created_entities.values());
}

/**
 * Increment batch counter
 */
export function incrementBatchCounter(state: ExtractionRunState): void {
  state.batches_processed++;
}
