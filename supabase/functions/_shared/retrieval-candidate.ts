/**
 * Phase 2: unified RetrievalCandidate representation and structured
 * retrieval adapters.
 *
 * Deno-compatible (only imports Phase 1's own Deno-compatible modules) pure
 * conversion functions that turn document chunks and structured knowledge
 * (entities, field values, relationships, events) into one common
 * `RetrievalCandidate` shape.
 *
 * Scope of this module: representation only. It does not query a database,
 * does not rank/merge candidates across kinds, and is not wired into
 * `ask-question`'s prompt/context building — see the integration-point note
 * below for where that would plug in later without disturbing this module.
 *
 * Reuses Phase 1's `UnifiedRetrievalScope` and the `branch-resolution.ts`
 * resolver rather than re-deciding Main/Branch membership here: every
 * adapter in this file takes *already-resolved* effective rows (the output
 * of `resolveEffectiveEntities`, `resolveEffectiveEntityValues`,
 * `resolveEffectiveBranchRelationships`, `resolveEffectiveEvents`) and only
 * adapts their shape — it never re-implements pending/rejected/superseded
 * filtering or add/remove overlay semantics.
 *
 * Integration point (see Phase 2 report): `supabase/functions/ask-question/index.ts`
 * computes `sources: QASource[]` (chunks) and `entityInfo`/`entityNames`
 * (entities) independently around lines 650-676, then serializes each to a
 * separate string and passes both into `buildQAPrompt(question, context,
 * entityInfo)` (line 741) — there is no existing single "combined list"
 * variable to slot into today. Introducing `RetrievalCandidate[]` there
 * would mean adding a new step, not extending an existing one, so per Phase
 * 2 scope this module stops at providing the shape and adapters; wiring it
 * into that flow is left for a later phase.
 */

import type { BranchId } from "./retrieval-scope.ts";
import type {
  BranchRelationshipRecord,
  EffectiveEntity,
  KnowledgeEntityValueRecord,
  KnowledgeEventRecord,
} from "./branch-resolution.ts";
import { resolveEffectiveEntityValues } from "./branch-resolution.ts";
import type { QASource } from "./notebook-types.ts";

// ---------------------------------------------------------------------------
// Unified candidate shape
// ---------------------------------------------------------------------------

export type RetrievalCandidateKind = "chunk" | "entity" | "value" | "relationship" | "event";

/**
 * Mirrors the layer vocabulary already used across the DB and Phase 1's
 * `EffectiveEntity.layer`, extended with `"branch"` for relationship/event
 * rows (which use the plain `layer: 'main' | 'branch'` DB vocabulary, not
 * the entity-specific override distinction).
 */
export type RetrievalCandidateLayer = "main" | "branch" | "branch-only" | "main-with-override";

export interface RetrievalCandidate {
  kind: RetrievalCandidateKind;
  /** Stable id within its `kind` (not globally unique across kinds — pair with `kind` for identity). */
  id: string;
  projectId: string;
  branchId: BranchId;
  layer: RetrievalCandidateLayer;
  /** Human-readable text representation, for eventual context assembly. Not sent to any LLM by this module. */
  text: string;
  /** Retrieval relevance score, when the source adapter has one (e.g. chunk full-text search). `null` when not applicable. */
  score: number | null;
  /** Extraction/user confidence, when known. `null` when not tracked for this kind. */
  confidence: number | null;
  /** Chunk ids this candidate is grounded in. Empty when the source data carries no chunk-level link — never fabricated. */
  sourceChunkIds: string[];
  /** Document version ids this candidate is grounded in. Empty when not tracked for this kind. */
  versionIds: string[];
  /** Other provenance identifiers (e.g. a raw_extraction_id) that explain why this candidate was retrieved. Empty when none exist. */
  evidence: string[];
}

function layerForBranchId(branchId: BranchId): "main" | "branch" {
  return branchId === null ? "main" : "branch";
}

// ---------------------------------------------------------------------------
// Chunk adapter — preserves existing chunk-retrieval behavior exactly
// ---------------------------------------------------------------------------

/**
 * Convert already-retrieved chunks (the existing `QASource[]` shape
 * `ask-question` already produces via `legacyHybridSearch`/
 * `enhancedHybridSearch`) into candidates. Purely a shape adapter — does not
 * re-run search, re-filter, re-order, or otherwise touch the existing
 * chunk-retrieval behavior it wraps.
 */
export function chunkToCandidates(
  sources: QASource[],
  projectId: string,
  branchId: BranchId,
): RetrievalCandidate[] {
  return sources.map((source) => ({
    kind: "chunk",
    id: source.chunkId,
    projectId,
    branchId,
    // Document chunks carry no branch/layer concept today (no `branch_id`
    // column on document_chunks) — "main" reflects that they are not
    // Branch-scoped, independent of which branch the surrounding QA request selected.
    layer: "main",
    text: source.content,
    score: source.score,
    confidence: null,
    sourceChunkIds: [source.chunkId],
    versionIds: [source.versionId],
    evidence: [],
  }));
}

// ---------------------------------------------------------------------------
// Entity adapter
// ---------------------------------------------------------------------------

/** Convert already-resolved effective entities (Phase 1 output) into candidates. */
export function entitiesToCandidates(
  entities: EffectiveEntity[],
  projectId: string,
): RetrievalCandidate[] {
  return entities.map((entity) => ({
    kind: "entity",
    id: entity.conceptualEntityId,
    projectId,
    branchId: entity.branchId,
    layer: entity.layer,
    text: entity.description
      ? `${entity.canonicalName} (${entity.entityType}): ${entity.description}`
      : `${entity.canonicalName} (${entity.entityType})`,
    score: null,
    confidence: null,
    // Entities are not tracked at chunk granularity in the current schema.
    sourceChunkIds: [],
    versionIds: entity.versionId ? [entity.versionId] : [],
    evidence: entity.rawExtractionId ? [entity.rawExtractionId] : [],
  }));
}

// ---------------------------------------------------------------------------
// Value adapter
// ---------------------------------------------------------------------------

/**
 * Find the raw value record that Phase 1's `resolveEffectiveEntityValues`
 * chose as the winner for one field, purely to recover its provenance
 * (`raw_extraction_id`) for the candidate's `evidence` — this does not
 * re-decide which value wins; it looks up the record behind an
 * already-decided answer using the same `valueLookupKeys` Phase 1 used.
 */
export function findWinningValueRecord(
  entity: EffectiveEntity,
  values: KnowledgeEntityValueRecord[],
  fieldPath: string,
): KnowledgeEntityValueRecord | undefined {
  const activeForField = values.filter(
    (value) => value.value_status === "active" && value.field_path === fieldPath,
  );
  const matchesKey = (value: KnowledgeEntityValueRecord, branchId: BranchId) =>
    entity.valueLookupKeys.some((key) => key.branchId === branchId && key.entityId === value.entity_id);

  if (entity.branchId !== null) {
    const branchMatch = activeForField.find(
      (value) => value.branch_id === entity.branchId && matchesKey(value, entity.branchId),
    );
    if (branchMatch) return branchMatch;
  }
  return activeForField.find((value) => value.branch_id === null && matchesKey(value, null));
}

/**
 * Convert an entity's effective field values (via Phase 1's
 * `resolveEffectiveEntityValues`) into one candidate per field. Rejected and
 * superseded values are already excluded by Phase 1's resolver.
 */
export function valuesToCandidates(
  entity: EffectiveEntity,
  values: KnowledgeEntityValueRecord[],
  projectId: string,
): RetrievalCandidate[] {
  const resolved = resolveEffectiveEntityValues(entity, values);
  return resolved.map((fieldValue) => {
    const record = findWinningValueRecord(entity, values, fieldValue.fieldPath);
    return {
      kind: "value" as const,
      id: `${entity.conceptualEntityId}:${fieldValue.fieldPath}`,
      projectId,
      branchId: entity.branchId,
      layer: entity.layer,
      text: `${fieldValue.fieldPath}: ${JSON.stringify(fieldValue.value)}`,
      score: null,
      confidence: null,
      sourceChunkIds: [],
      versionIds: [],
      evidence: record?.raw_extraction_id ? [record.raw_extraction_id] : [],
    };
  });
}

// ---------------------------------------------------------------------------
// Relationship adapter
// ---------------------------------------------------------------------------

function stringField(relationship: BranchRelationshipRecord, key: string): string | null {
  const value = relationship[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Convert an already-resolved effective relationship list (Phase 1's
 * `resolveEffectiveBranchRelationships` output) into candidates. Does not
 * re-apply add/remove/approved semantics — those are already baked into the
 * list passed in.
 */
export function relationshipsToCandidates(
  relationships: BranchRelationshipRecord[],
  projectId: string,
): RetrievalCandidate[] {
  return relationships.map((relationship) => ({
    kind: "relationship",
    id: relationship.id ??
      `${relationship.source_entity_id}:${relationship.target_entity_id}:${relationship.relationship_type}`,
    projectId,
    branchId: relationship.branch_id,
    layer: layerForBranchId(relationship.branch_id),
    text: `${relationship.source_entity_id} —${relationship.relationship_type}→ ${relationship.target_entity_id}`,
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: [],
    evidence: (() => {
      const rawExtractionId = stringField(relationship, "raw_extraction_id");
      return rawExtractionId ? [rawExtractionId] : [];
    })(),
  }));
}

// ---------------------------------------------------------------------------
// Event adapter
// ---------------------------------------------------------------------------

/**
 * Convert an already-resolved effective event list (Phase 1's
 * `resolveEffectiveEvents` output, additive-only) into candidates.
 */
export function eventsToCandidates(
  events: KnowledgeEventRecord[],
  projectId: string,
): RetrievalCandidate[] {
  return events.map((event) => ({
    kind: "event",
    id: event.id,
    projectId,
    branchId: event.branch_id,
    layer: layerForBranchId(event.branch_id),
    text: event.description ? `${event.name}: ${event.description}` : event.name,
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: event.version_id ? [event.version_id] : [],
    evidence: event.raw_extraction_id ? [event.raw_extraction_id] : [],
  }));
}
