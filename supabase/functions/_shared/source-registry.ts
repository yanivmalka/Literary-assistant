/**
 * Phase 7: Evidence-backed source registry.
 *
 * Infrastructure for future citation rendering — not wired into the answer,
 * the QA prompt, or `QASource[]` yet. Its only job is to preserve the
 * mapping that already exists but is otherwise lost when a selected
 * candidate is formatted into the structured-context text block (Phase
 * 5.2's `formatStructuredKnowledgeContext`, which reads only `candidate.text`):
 *
 *   context item / candidate -> source identity -> real evidence -> chunk / version / document / position
 *
 * Pure and read-only: never queries a database, never re-resolves Main/Branch
 * membership, never re-ranks or re-selects, and never fabricates a chunk id,
 * position, version, or document. It only reads what Phase 3's
 * `attach*Evidence` helpers already resolved onto each
 * `RetrievalCandidateWithEvidence` (see `evidence.ts`'s ground-truth schema
 * audit) and organizes it by candidate.
 *
 * What can resolve to a real chunk today (per `evidence.ts`'s audit):
 * - `value` candidates, only when a `knowledge_entity_value_evidence` row for
 *   the winning value has a non-null `chunk_id` (`resolveValueEvidence`).
 * - `entity` candidates, only when a `knowledge_entity_mentions` row for that
 *   entity has a non-null `chunk_id` (`resolveMentionEvidence`).
 * - `chunk` candidates are themselves the chunk — trivially chunk-grounded.
 *
 * What can only resolve to extraction-level provenance (version/document/
 * raw-extraction id, never a chunk):
 * - `relationship` and `event` candidates always (neither table has a
 *   `chunk_id` column).
 * - `entity`/`value` candidates additionally carry `extraction-provenance`
 *   evidence (entities always; values do not — `attachValueEvidence` only
 *   ever attaches `value-evidence`), which is exposed as extraction-only.
 *
 * A candidate with no real evidence at all (no mention, no value-evidence
 * row, no version/document/raw-extraction id) resolves to `"unresolved"`
 * with an empty `sources` list — never a fabricated placeholder.
 */

import type { RetrievalCandidate, RetrievalCandidateKind } from "./retrieval-candidate.ts";
import type { EvidenceKind, RetrievalCandidateWithEvidence, UnifiedEvidence } from "./evidence.ts";
import type { RankedCandidate } from "./ranking.ts";

export type SourceResolutionKind = "chunk-grounded" | "extraction-only" | "unresolved";

export interface ResolvedEvidenceSource {
  evidenceId: string;
  evidenceKind: EvidenceKind;
  chunkId: string | null;
  versionId: string | null;
  documentId: string | null;
  startPosition: number | null;
  endPosition: number | null;
  fieldPath: string | null;
}

export interface CandidateSourceEntry {
  candidateId: string;
  candidateKind: RetrievalCandidateKind;
  resolution: SourceResolutionKind;
  sources: ResolvedEvidenceSource[];
}

function fromUnifiedEvidence(evidence: UnifiedEvidence): ResolvedEvidenceSource {
  return {
    evidenceId: evidence.id,
    evidenceKind: evidence.kind,
    chunkId: evidence.chunkId,
    versionId: evidence.versionId,
    documentId: evidence.documentId,
    startPosition: evidence.startPosition,
    endPosition: evidence.endPosition,
    fieldPath: evidence.fieldPath,
  };
}

/**
 * A `kind: "chunk"` candidate is itself the terminal evidence unit (Phase 3's
 * `attachChunkEvidence` always leaves `evidenceRecords: []` for it) — its
 * source identity is its own real `id`/`versionIds`, exactly as already
 * produced by the existing, unmodified chunk retrieval and Phase 2's
 * `chunkToCandidates`. Nothing here re-derives or re-labels that data.
 */
function resolveChunkCandidateSource(candidate: RetrievalCandidate): CandidateSourceEntry {
  return {
    candidateId: candidate.id,
    candidateKind: "chunk",
    resolution: "chunk-grounded",
    sources: [{
      evidenceId: candidate.id,
      evidenceKind: "mention",
      chunkId: candidate.id,
      versionId: candidate.versionIds[0] ?? null,
      documentId: null,
      startPosition: null,
      endPosition: null,
      fieldPath: null,
    }],
  };
}

/**
 * Resolves one already-selected candidate's real, already-attached evidence
 * into a source entry. Reads `candidate.evidenceRecords` as-is; never
 * queries, re-resolves, or invents anything beyond what Phase 3 already put there.
 */
export function resolveCandidateSource(candidate: RetrievalCandidateWithEvidence): CandidateSourceEntry {
  if (candidate.kind === "chunk") return resolveChunkCandidateSource(candidate);

  const sources = candidate.evidenceRecords.map(fromUnifiedEvidence);
  if (sources.length === 0) {
    return { candidateId: candidate.id, candidateKind: candidate.kind, resolution: "unresolved", sources: [] };
  }

  const resolution: SourceResolutionKind = sources.some((source) => source.chunkId !== null)
    ? "chunk-grounded"
    : "extraction-only";

  return { candidateId: candidate.id, candidateKind: candidate.kind, resolution, sources };
}

/**
 * Builds the full registry for an already-selected (Phase 5.1) list of
 * ranked candidates, preserving their order. Does not mutate its input.
 */
export function buildSourceRegistry(
  selected: readonly RankedCandidate<RetrievalCandidateWithEvidence>[],
): CandidateSourceEntry[] {
  return selected.map((entry) => resolveCandidateSource(entry.candidate));
}
