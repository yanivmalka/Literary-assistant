/**
 * Phase 3: Evidence Federation.
 *
 * Deno-compatible pure helpers that let a Phase 2 `RetrievalCandidate` expose
 * its real underlying evidence — without changing the Phase 2 candidate
 * contract, retrieval behavior, persistence, schema, or QA prompts.
 *
 * Ground-truth schema audit (verified against migrations and the actual
 * write paths in `extract-knowledge/index.ts` and `value-sync.ts`, not just
 * column names or comments):
 *
 * - `knowledge_entity_value_evidence` (migration 105) is a real child table
 *   of `knowledge_entity_values`: `value_id, chunk_id, quote, position_start,
 *   position_end, page_number, raw_extraction_id`. Written by
 *   `value-sync.ts`'s `persistEvidence`. `chunk_id`/`position_start`/
 *   `position_end` are populated when the caller has field-level evidence
 *   resolved to a real chunk (`field-provenance.ts:43`, `chunk?.id ?? null`);
 *   the generic fallback path writes them as `null`. Both are real —
 *   evidence rows with a `null` chunk_id genuinely carry no chunk-level
 *   grounding and must not be treated as if they did.
 * - `knowledge_entity_mentions` (migration 007, extended by migration 112)
 *   has a real `chunk_id` FK (nullable) and `page_number`, populated by
 *   `extract-knowledge/index.ts` via a chunk-position lookup. This is the
 *   most reliably chunk-grounded evidence path in the schema.
 * - `knowledge_entities`, `knowledge_entity_relationships`, and
 *   `knowledge_events` each carry real `document_id`/`version_id`/
 *   `raw_extraction_id` columns, populated at extraction-write time — but
 *   none of them has a `chunk_id` column (relationships/events only have a
 *   non-FK `chunk_position` integer index, which is not a stable chunk
 *   identifier and is deliberately not surfaced here as if it were one).
 * - `document_chunks` has no character-offset columns at all — chunk-level
 *   start/end text-span offsets are never fabricated by this module.
 *
 * This module never queries a database and never re-decides Main/Branch
 * membership, review/pending status, or value precedence — it only traces
 * provenance for rows that Phase 1's resolvers (`branch-resolution.ts`) or
 * Phase 2's adapters (`retrieval-candidate.ts`) already decided belong to
 * the requested scope. Evidence is attached via small `attach*` functions
 * that return a *new* object carrying an `evidenceRecords` array alongside
 * the unmodified Phase 2 `RetrievalCandidate` — the base candidate shape and
 * every existing Phase 2 adapter are untouched, so nothing here can change
 * Phase 2 behavior for a caller that doesn't opt in.
 */

import type { BranchId } from "./retrieval-scope.ts";
import type {
  BranchRelationshipRecord,
  EffectiveEntity,
  KnowledgeEntityValueRecord,
  KnowledgeEventRecord,
} from "./branch-resolution.ts";
import { findWinningValueRecord } from "./retrieval-candidate.ts";
import type { RetrievalCandidate } from "./retrieval-candidate.ts";

// ---------------------------------------------------------------------------
// Unified evidence shape
// ---------------------------------------------------------------------------

export type EvidenceKind = "value-evidence" | "mention" | "extraction-provenance";

export interface UnifiedEvidence {
  kind: EvidenceKind;
  id: string;
  chunkId: string | null;
  versionId: string | null;
  documentId: string | null;
  /** Character-span offsets, only when the underlying row genuinely carries them. */
  startPosition: number | null;
  endPosition: number | null;
  /** Set only for evidence scoped to one field (value-evidence); `null` for entity/relationship/event-level provenance. */
  fieldPath: string | null;
  sourceType: string | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
}

export interface RetrievalCandidateWithEvidence extends RetrievalCandidate {
  evidenceRecords: UnifiedEvidence[];
}

// ---------------------------------------------------------------------------
// Raw row shapes (subset of the actual DB columns needed for federation)
// ---------------------------------------------------------------------------

export interface KnowledgeEntityValueEvidenceRecord {
  id: string;
  value_id: string;
  chunk_id: string | null;
  quote?: string | null;
  position_start: number | null;
  position_end: number | null;
  page_number?: number | null;
  raw_extraction_id: string | null;
}

export interface KnowledgeEntityMentionRecord {
  id: string;
  entity_id: string;
  chunk_id: string | null;
  page_number?: number | null;
  evidence?: string | null;
}

// ---------------------------------------------------------------------------
// Pure evidence resolvers
// ---------------------------------------------------------------------------

/**
 * Evidence for one resolved field value, via `knowledge_entity_value_evidence`.
 * Rows without a `chunk_id` carry no recoverable chunk-level grounding and
 * are excluded rather than surfaced with a fabricated location.
 */
export function resolveValueEvidence(
  valueId: string,
  fieldPath: string,
  evidenceRows: KnowledgeEntityValueEvidenceRecord[],
): UnifiedEvidence[] {
  return evidenceRows
    .filter((row) => row.value_id === valueId && row.chunk_id !== null)
    .map((row) => ({
      kind: "value-evidence",
      id: row.id,
      chunkId: row.chunk_id,
      versionId: null,
      documentId: null,
      startPosition: row.position_start,
      endPosition: row.position_end,
      fieldPath,
      sourceType: "value_evidence",
      confidence: null,
      metadata: row.raw_extraction_id ? { rawExtractionId: row.raw_extraction_id } : {},
    }));
}

/**
 * Evidence for an entity via `knowledge_entity_mentions`. `entityId` must be
 * the id mentions were actually written against — `EffectiveEntity.conceptualEntityId`
 * for every layer (Main, Main-with-override, and branch-only all resolve to
 * the same underlying `knowledge_entities.id` mentions reference).
 */
export function resolveMentionEvidence(
  entityId: string,
  mentions: KnowledgeEntityMentionRecord[],
): UnifiedEvidence[] {
  return mentions
    .filter((mention) => mention.entity_id === entityId && mention.chunk_id !== null)
    .map((mention) => ({
      kind: "mention",
      id: mention.id,
      chunkId: mention.chunk_id,
      versionId: null,
      documentId: null,
      startPosition: null,
      endPosition: null,
      fieldPath: null,
      sourceType: "mention",
      confidence: null,
      metadata: mention.page_number != null ? { pageNumber: mention.page_number } : {},
    }));
}

/**
 * Entity/relationship/event-level provenance from real `document_id`/
 * `version_id`/`raw_extraction_id` columns — no chunk-level grounding, since
 * none of those tables has a `chunk_id` column. Returns an empty list when
 * none of the three is present, rather than fabricating a record.
 */
export function resolveExtractionProvenanceEvidence(params: {
  versionId: string | null;
  documentId: string | null;
  rawExtractionId: string | null;
  sourceType: string;
}): UnifiedEvidence[] {
  const { versionId, documentId, rawExtractionId, sourceType } = params;
  if (versionId === null && documentId === null && rawExtractionId === null) return [];
  return [{
    kind: "extraction-provenance",
    id: rawExtractionId ?? `${sourceType}:${versionId ?? ""}:${documentId ?? ""}`,
    chunkId: null,
    versionId,
    documentId,
    startPosition: null,
    endPosition: null,
    fieldPath: null,
    sourceType,
    confidence: null,
    metadata: {},
  }];
}

// ---------------------------------------------------------------------------
// Attach helpers — compose Phase 2 candidates with federated evidence
// ---------------------------------------------------------------------------

function stringField(relationship: BranchRelationshipRecord, key: string): string | null {
  const value = relationship[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Chunks are themselves the terminal evidence unit — nothing to federate beneath them. */
export function attachChunkEvidence(candidate: RetrievalCandidate): RetrievalCandidateWithEvidence {
  return { ...candidate, evidenceRecords: [] };
}

export function attachEntityEvidence(
  candidate: RetrievalCandidate,
  entity: EffectiveEntity,
  mentions: KnowledgeEntityMentionRecord[],
): RetrievalCandidateWithEvidence {
  const evidenceRecords = [
    ...resolveMentionEvidence(entity.conceptualEntityId, mentions),
    ...resolveExtractionProvenanceEvidence({
      versionId: entity.versionId,
      documentId: entity.documentId,
      rawExtractionId: entity.rawExtractionId,
      sourceType: "entity",
    }),
  ];
  return { ...candidate, evidenceRecords };
}

/**
 * `fieldPath` and `values` mirror what `valuesToCandidates` (Phase 2) used to
 * build this candidate — reused here only to re-find the winning raw record
 * (via `findWinningValueRecord`, the same lookup Phase 2 already performs
 * for `raw_extraction_id`) and join its `id` into `knowledge_entity_value_evidence`.
 * Does not re-decide which value wins.
 */
export function attachValueEvidence(
  candidate: RetrievalCandidate,
  entity: EffectiveEntity,
  fieldPath: string,
  values: KnowledgeEntityValueRecord[],
  evidenceRows: KnowledgeEntityValueEvidenceRecord[],
): RetrievalCandidateWithEvidence {
  const record = findWinningValueRecord(entity, values, fieldPath);
  const evidenceRecords = record?.id ? resolveValueEvidence(record.id, fieldPath, evidenceRows) : [];
  return { ...candidate, evidenceRecords };
}

export function attachRelationshipEvidence(
  candidate: RetrievalCandidate,
  relationship: BranchRelationshipRecord,
): RetrievalCandidateWithEvidence {
  const evidenceRecords = resolveExtractionProvenanceEvidence({
    versionId: stringField(relationship, "version_id"),
    documentId: stringField(relationship, "document_id"),
    rawExtractionId: stringField(relationship, "raw_extraction_id"),
    sourceType: "relationship",
  });
  return { ...candidate, evidenceRecords };
}

export function attachEventEvidence(
  candidate: RetrievalCandidate,
  event: KnowledgeEventRecord,
): RetrievalCandidateWithEvidence {
  const evidenceRecords = resolveExtractionProvenanceEvidence({
    versionId: event.version_id ?? null,
    documentId: event.document_id ?? null,
    rawExtractionId: event.raw_extraction_id ?? null,
    sourceType: "event",
  });
  return { ...candidate, evidenceRecords };
}

// BranchId re-export kept for callers that only need this module.
export type { BranchId };
