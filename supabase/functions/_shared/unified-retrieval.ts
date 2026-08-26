/**
 * Phase 5: full integration of Phase 1-4 into the retrieval flow.
 *
 * This module is the "small orchestration function" the retrieval flow is
 * wired through — split into a pure part (`buildUnifiedRetrieval`, fully
 * unit-testable with constructed rows, no I/O) and a thin DB-loading part
 * (`loadUnifiedRetrievalRows`) that only fetches already-scoped rows and
 * hands them to the pure part. Neither part re-implements anything from
 * Phases 1-4: they call `resolveEffectiveEntities` /
 * `resolveEffectiveEntityValues` / `resolveEffectiveBranchRelationships` /
 * `resolveEffectiveEvents` (Phase 1), the five `*ToCandidates` adapters
 * (Phase 2), the `attach*Evidence` helpers (Phase 3), and `rankCandidates`
 * (Phase 4) exactly as already implemented and tested.
 *
 * Document-chunk retrieval is deliberately NOT reimplemented here — the
 * existing `hybridSearch`/`legacyHybridSearch`/`enhancedHybridSearch` in
 * `ask-question/index.ts` keep running unchanged, and their `QASource[]`
 * output is passed into `buildUnifiedRetrieval` as-is via `chunkToCandidates`.
 * This preserves the existing chunk retrieval source, filtering, ordering,
 * scores, and fallback behavior exactly.
 */

import type { BranchId } from "./retrieval-scope.ts";
import { normalizeUnifiedRetrievalScope, type RawUnifiedRetrievalScope, type UnifiedRetrievalScope } from "./retrieval-scope.ts";
import {
  resolveEffectiveBranchRelationships,
  resolveEffectiveEntities,
  resolveEffectiveEntityValues,
  resolveEffectiveEvents,
  type BranchRelationshipRecord,
  type EffectiveEntity,
  type KnowledgeBranchEntityRecord,
  type KnowledgeEntityRecord,
  type KnowledgeEntityValueRecord,
  type KnowledgeEventRecord,
} from "./branch-resolution.ts";
import {
  chunkToCandidates,
  entitiesToCandidates,
  eventsToCandidates,
  relationshipsToCandidates,
  valuesToCandidates,
} from "./retrieval-candidate.ts";
import {
  attachChunkEvidence,
  attachEntityEvidence,
  attachEventEvidence,
  attachRelationshipEvidence,
  attachValueEvidence,
  type KnowledgeEntityMentionRecord,
  type KnowledgeEntityValueEvidenceRecord,
  type RetrievalCandidateWithEvidence,
} from "./evidence.ts";
import { rankCandidates, type RankedCandidate, type RankingWeights } from "./ranking.ts";
import type { QASource } from "./notebook-types.ts";

// ---------------------------------------------------------------------------
// Pure orchestration
// ---------------------------------------------------------------------------

export interface UnifiedRetrievalRows {
  chunks: QASource[];
  mainEntities: KnowledgeEntityRecord[];
  branchEntities: KnowledgeEntityRecord[];
  branchOverlays: KnowledgeBranchEntityRecord[];
  entityValues: KnowledgeEntityValueRecord[];
  valueEvidence: KnowledgeEntityValueEvidenceRecord[];
  mentions: KnowledgeEntityMentionRecord[];
  mainRelationships: BranchRelationshipRecord[];
  branchRelationships: BranchRelationshipRecord[];
  mainEvents: KnowledgeEventRecord[];
  branchEvents: KnowledgeEventRecord[];
}

export const EMPTY_UNIFIED_RETRIEVAL_ROWS: UnifiedRetrievalRows = {
  chunks: [],
  mainEntities: [],
  branchEntities: [],
  branchOverlays: [],
  entityValues: [],
  valueEvidence: [],
  mentions: [],
  mainRelationships: [],
  branchRelationships: [],
  mainEvents: [],
  branchEvents: [],
};

export interface UnifiedRetrievalResult {
  scope: UnifiedRetrievalScope;
  effectiveEntities: EffectiveEntity[];
  candidates: RetrievalCandidateWithEvidence[];
  ranked: RankedCandidate<RetrievalCandidateWithEvidence>[];
}

/**
 * Pure: builds the effective knowledge state (Phase 1), adapts it to
 * `RetrievalCandidate`s alongside the existing chunks (Phase 2), federates
 * real evidence (Phase 3), and ranks the unified set (Phase 4). Takes only
 * already-loaded rows — never queries a database, never infers a branch that
 * wasn't explicitly passed in `rawScope.branchId`.
 */
export function buildUnifiedRetrieval(
  rows: UnifiedRetrievalRows,
  rawScope: RawUnifiedRetrievalScope,
  weights?: RankingWeights,
): UnifiedRetrievalResult {
  const scope = normalizeUnifiedRetrievalScope(rawScope);
  const projectId = scope.projectId;
  const branchId: BranchId = scope.branchId;

  const effectiveEntities = resolveEffectiveEntities(
    rows.mainEntities,
    rows.branchEntities,
    rows.branchOverlays,
    branchId,
    { includePendingBranchData: scope.includePendingBranchData },
  );

  const effectiveRelationships = resolveEffectiveBranchRelationships(
    rows.mainRelationships,
    rows.branchRelationships,
    branchId,
  );

  const effectiveEvents = resolveEffectiveEvents(rows.mainEvents, rows.branchEvents, branchId);

  const candidates: RetrievalCandidateWithEvidence[] = [];

  for (const chunkCandidate of chunkToCandidates(rows.chunks, projectId, branchId)) {
    candidates.push(attachChunkEvidence(chunkCandidate));
  }

  const entityCandidatesByConceptualId = new Map(
    entitiesToCandidates(effectiveEntities, projectId).map((candidate) => [candidate.id, candidate] as const),
  );
  for (const entity of effectiveEntities) {
    const entityCandidate = entityCandidatesByConceptualId.get(entity.conceptualEntityId);
    if (!entityCandidate) continue;
    candidates.push(attachEntityEvidence(entityCandidate, entity, rows.mentions));

    for (const valueCandidate of valuesToCandidates(entity, rows.entityValues, projectId)) {
      const fieldPath = resolveEffectiveEntityValues(entity, rows.entityValues)
        .find((resolved) => valueCandidate.id === `${entity.conceptualEntityId}:${resolved.fieldPath}`)?.fieldPath;
      if (!fieldPath) continue;
      candidates.push(attachValueEvidence(valueCandidate, entity, fieldPath, rows.entityValues, rows.valueEvidence));
    }
  }

  for (const relationshipCandidate of relationshipsToCandidates(effectiveRelationships, projectId)) {
    const relationship = effectiveRelationships.find((rel) =>
      (rel.id ?? `${rel.source_entity_id}:${rel.target_entity_id}:${rel.relationship_type}`) === relationshipCandidate.id
    );
    if (!relationship) continue;
    candidates.push(attachRelationshipEvidence(relationshipCandidate, relationship));
  }

  const eventById = new Map(effectiveEvents.map((event) => [event.id, event] as const));
  for (const eventCandidate of eventsToCandidates(effectiveEvents, projectId)) {
    const event = eventById.get(eventCandidate.id);
    if (!event) continue;
    candidates.push(attachEventEvidence(eventCandidate, event));
  }

  const ranked = rankCandidates(candidates, weights);

  return { scope, effectiveEntities, candidates, ranked };
}

// ---------------------------------------------------------------------------
// DB-loading wrapper (not unit-tested here; thin glue only)
// ---------------------------------------------------------------------------

export interface LoadUnifiedRetrievalRowsParams {
  supabase: any;
  projectId: string;
  branchId: BranchId;
}

/**
 * Loads the rows `buildUnifiedRetrieval` needs, scoped to this project and
 * (when selected) this branch only — never a different branch. Chunks are
 * NOT loaded here; callers pass in the `QASource[]` already produced by the
 * existing chunk retrieval so that path stays completely untouched.
 */
export async function loadUnifiedRetrievalRows(
  params: LoadUnifiedRetrievalRowsParams,
): Promise<Omit<UnifiedRetrievalRows, "chunks">> {
  const { supabase, projectId, branchId } = params;

  const [mainEntitiesRes, branchEntitiesRes, branchOverlaysRes] = await Promise.all([
    supabase
      .from("knowledge_entities")
      .select("id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, layer, branch_id, review_status, version_id, document_id, raw_extraction_id")
      .eq("project_id", projectId)
      .eq("layer", "main"),
    branchId
      ? supabase
        .from("knowledge_entities")
        .select("id, canonical_name, entity_type, entity_types, description, attributes, structured_fields, layer, branch_id, review_status, version_id, document_id, raw_extraction_id")
        .eq("project_id", projectId)
        .eq("layer", "branch")
        .eq("branch_id", branchId)
      : Promise.resolve({ data: [], error: null }),
    branchId
      ? supabase
        .from("knowledge_branch_entities")
        .select("id, branch_id, source_entity_id, entity_id, overrides, rejected_fields")
        .eq("branch_id", branchId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const mainEntities: KnowledgeEntityRecord[] = mainEntitiesRes.data ?? [];
  const branchEntities: KnowledgeEntityRecord[] = branchEntitiesRes.data ?? [];
  const branchOverlays: KnowledgeBranchEntityRecord[] = branchOverlaysRes.data ?? [];

  const allEntityIds = [
    ...mainEntities.map((e) => e.id),
    ...branchEntities.map((e) => e.id),
  ];

  // Values/mentions are only meaningful when there is at least one entity to
  // attach them to (both queries are `.in("entity_id", allEntityIds)`, which
  // is invalid/unbounded with an empty list). Relationships and events, by
  // contrast, are scoped by `project_id`/`branch_id` alone and exist
  // independently of any entity row, so they must still be loaded even when
  // `allEntityIds` is empty — a question about an Event with no extracted
  // entities must still surface that Event.
  const [valuesRes, mentionsRes] = allEntityIds.length > 0
    ? await Promise.all([
      supabase
        .from("knowledge_entity_values")
        .select("id, entity_id, branch_id, field_path, value_json, source_type, value_status, raw_extraction_id")
        .in("entity_id", allEntityIds),
      supabase
        .from("knowledge_entity_mentions")
        .select("id, entity_id, chunk_id, page_number, evidence")
        .in("entity_id", allEntityIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const [mainRelRes, branchRelRes, mainEventsRes, branchEventsRes] = await Promise.all([
    supabase
      .from("knowledge_entity_relationships")
      .select("id, branch_id, source_entity_id, target_entity_id, relationship_type, operation, review_status, document_id, version_id, raw_extraction_id")
      .eq("project_id", projectId)
      .is("branch_id", null),
    branchId
      ? supabase
        .from("knowledge_entity_relationships")
        .select("id, branch_id, source_entity_id, target_entity_id, relationship_type, operation, review_status, document_id, version_id, raw_extraction_id")
        .eq("project_id", projectId)
        .eq("branch_id", branchId)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("knowledge_events")
      .select("id, branch_id, name, description, attributes, document_id, version_id, raw_extraction_id")
      .eq("project_id", projectId)
      .is("branch_id", null),
    branchId
      ? supabase
        .from("knowledge_events")
        .select("id, branch_id, name, description, attributes, document_id, version_id, raw_extraction_id")
        .eq("project_id", projectId)
        .eq("branch_id", branchId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const entityValues: KnowledgeEntityValueRecord[] = valuesRes.data ?? [];

  // knowledge_entity_value_evidence has no branch_id of its own — it is only
  // ever joined via value_id, and `entityValues` here is already scoped to
  // exactly the Main + (if selected) this-branch's entities (`allEntityIds`
  // above), so this join cannot pull in another branch's evidence.
  const valueIds = entityValues.map((value) => value.id).filter((id): id is string => Boolean(id));
  const valueEvidenceRes = valueIds.length > 0
    ? await supabase
      .from("knowledge_entity_value_evidence")
      .select("id, value_id, chunk_id, quote, position_start, position_end, page_number, raw_extraction_id")
      .in("value_id", valueIds)
    : { data: [], error: null };

  return {
    mainEntities,
    branchEntities,
    branchOverlays,
    entityValues,
    valueEvidence: valueEvidenceRes.data ?? [],
    mentions: mentionsRes.data ?? [],
    mainRelationships: mainRelRes.data ?? [],
    branchRelationships: branchRelRes.data ?? [],
    mainEvents: mainEventsRes.data ?? [],
    branchEvents: branchEventsRes.data ?? [],
  };
}

export interface RunUnifiedRetrievalParams {
  supabase: any;
  projectId: string;
  branchId: BranchId;
  chunks: QASource[];
  rawScope: RawUnifiedRetrievalScope;
  weights?: RankingWeights;
}

/**
 * Thin orchestration entry point: loads structured-knowledge rows scoped to
 * this project/branch, then delegates entirely to the pure
 * `buildUnifiedRetrieval`. Chunks are supplied by the caller (already
 * retrieved via the existing, unmodified chunk retrieval).
 */
export async function runUnifiedRetrieval(params: RunUnifiedRetrievalParams): Promise<UnifiedRetrievalResult> {
  const { supabase, projectId, branchId, chunks, rawScope, weights } = params;
  const structuredRows = await loadUnifiedRetrievalRows({ supabase, projectId, branchId });
  return buildUnifiedRetrieval({ chunks, ...structuredRows }, rawScope, weights);
}
