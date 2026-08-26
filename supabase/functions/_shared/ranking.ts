/**
 * Phase 4: Ranking / Federation.
 *
 * Deno-compatible pure ranking layer over the Phase 2 `RetrievalCandidate`
 * representation (and Phase 3's optional `evidenceRecords`). This module
 * only orders already-produced candidates — it never queries a database,
 * never decides Main/Branch membership or effective-value precedence, never
 * applies pending/rejected/superseded filtering, and never resolves
 * evidence. All of that is already decided by the time a candidate reaches
 * this module; ranking only reads what's already on the candidate.
 *
 * Ground truth on what scoring signals the existing retrieval layer
 * actually produces today (verified in `ask-question/index.ts`, not
 * assumed):
 *
 * - Chunk `score` (`RetrievalCandidate.score` for `kind: "chunk"`) is a
 *   **rank-position placeholder** from Postgres full-text search
 *   (`legacyHybridSearch`/`enhancedHybridSearch`: `score: topK - index`, or a
 *   flat `0.5` for adjacency-merged chunks) — not a true lexical relevance
 *   score (no `ts_rank`) and not a semantic/embedding similarity score (no
 *   vector search is used in the QA retrieval path despite
 *   `documents/embeddings.ts` existing elsewhere in the pipeline). It is the
 *   closest thing to a real "lexical relevance" signal that exists today, so
 *   it is surfaced as `lexicalRelevance` — but `semanticRelevance` is
 *   genuinely unavailable and must not be fabricated from it.
 * - `findRelevantEntities` (the entity lookup used to build QA context) does
 *   substring matching only and produces no numeric relevance score.
 *   `entityRelevance` is therefore unavailable for every candidate today.
 * - Relationships and events carry no relevance score anywhere in the
 *   current retrieval or extraction code (`RetrievalCandidate.score` is
 *   always `null` for `kind: "relationship" | "event"` per Phase 2's
 *   adapters). `relationshipRelevance`/`eventRelevance` are unavailable.
 * - `RetrievalCandidate.confidence` is a real, typed field, but no existing
 *   Phase 2 adapter currently populates it (all set `confidence: null`) —
 *   it is read here as-is, so it becomes a real signal automatically once
 *   any adapter starts populating it, without this module changing.
 * - Phase 3's `evidenceRecords` (when present, i.e. the candidate went
 *   through an `attach*Evidence` step) is real, already-resolved evidence —
 *   `evidenceRelevance` is derived from how much of it exists, never
 *   fabricated when it doesn't.
 * - `RetrievalCandidate.layer`/`branchId` are real, already-resolved by
 *   Phase 1 — `mainBranchSource` reads them purely as a ranking input, never
 *   to alter which candidates exist or how they were resolved.
 * - No chunk-adjacency/position data exists on `RetrievalCandidate` itself
 *   today (only `sourceChunkIds`, which carries no ordering) —
 *   `chunkProximity` is unavailable.
 *
 * Every signal that is not backed by real data today resolves to `null`
 * ("unavailable") rather than a fabricated number, and `null` signals
 * contribute `0` to the federated score regardless of their configured
 * weight (see `scoreSignal`). Signals become live automatically, with no
 * changes to this module, the moment an upstream adapter starts populating
 * real data for them (e.g. `confidence`, or a future semantic score).
 */

import type { RetrievalCandidate, RetrievalCandidateLayer } from "./retrieval-candidate.ts";
import type { RetrievalCandidateWithEvidence } from "./evidence.ts";

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export interface RankingSignals {
  semanticRelevance: number | null;
  lexicalRelevance: number | null;
  entityRelevance: number | null;
  evidenceRelevance: number | null;
  confidence: number | null;
  mainBranchSource: number | null;
  chunkProximity: number | null;
  relationshipRelevance: number | null;
  eventRelevance: number | null;
}

export type RankingWeights = Record<keyof RankingSignals, number>;

/**
 * Documented defaults. Weight `0` for a signal means "not used" — it is the
 * honest default for every signal this repo's retrieval layer does not
 * currently produce real data for, so an unweighted signal can never
 * silently influence ranking. Only `lexicalRelevance` (backed by the real
 * chunk rank-position score), `evidenceRelevance` (backed by Phase 3's real
 * evidence count), and `confidence` (a real typed field, read as-is) get a
 * nonzero default.
 */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  semanticRelevance: 0,
  lexicalRelevance: 1,
  entityRelevance: 0,
  evidenceRelevance: 0.5,
  confidence: 0.5,
  mainBranchSource: 0,
  chunkProximity: 0,
  relationshipRelevance: 0,
  eventRelevance: 0,
};

const EVIDENCE_RELEVANCE_SATURATION = 3;

function hasEvidenceRecords(
  candidate: RetrievalCandidate | RetrievalCandidateWithEvidence,
): candidate is RetrievalCandidateWithEvidence {
  return "evidenceRecords" in candidate;
}

/**
 * Ordinal encoding of how directly Main-confirmed vs. Branch-provisional a
 * candidate's source is. Purely a ranking input — Main/Branch membership
 * itself was already decided upstream by Phase 1's resolver before this
 * candidate existed; this never changes that.
 */
function mainBranchSourceSignal(layer: RetrievalCandidateLayer): number {
  switch (layer) {
    case "main":
      return 1;
    case "main-with-override":
      return 0.75;
    case "branch-only":
    case "branch":
      return 0.5;
  }
}

/**
 * Default, pure signal extractor. Reads only what is already on the
 * candidate — never queries anything, never infers unavailable data.
 */
export function extractSignals(
  candidate: RetrievalCandidate | RetrievalCandidateWithEvidence,
): RankingSignals {
  const evidenceCount = hasEvidenceRecords(candidate) ? candidate.evidenceRecords.length : null;
  return {
    semanticRelevance: null,
    lexicalRelevance: candidate.kind === "chunk" ? candidate.score : null,
    entityRelevance: null,
    evidenceRelevance: evidenceCount === null
      ? null
      : Math.min(1, evidenceCount / EVIDENCE_RELEVANCE_SATURATION),
    confidence: candidate.confidence,
    mainBranchSource: mainBranchSourceSignal(candidate.layer),
    chunkProximity: null,
    relationshipRelevance: null,
    eventRelevance: null,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** A `null` (unavailable) signal always contributes exactly 0, regardless of its configured weight. */
export function scoreSignal(value: number | null, weight: number): number {
  if (value === null) return 0;
  return value * weight;
}

export function computeFederatedScore(
  signals: RankingSignals,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  return (Object.keys(signals) as (keyof RankingSignals)[])
    .reduce((total, key) => total + scoreSignal(signals[key], weights[key]), 0);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface RankedCandidate<C extends RetrievalCandidate = RetrievalCandidate> {
  /** The original candidate, byte-for-byte unmodified. */
  candidate: C;
  signals: RankingSignals;
  /** Derived score. Never overwrites `candidate.score`, which is preserved verbatim. */
  federatedScore: number;
}

/**
 * Rank a unified collection of candidates (any mix of the five kinds, and of
 * plain `RetrievalCandidate` / Phase 3 `RetrievalCandidateWithEvidence`).
 * Pure and deterministic: does not mutate its input, and ties are broken by
 * `kind` then `id` so equal-scoring candidates always sort the same way.
 */
export function rankCandidates<C extends RetrievalCandidate>(
  candidates: readonly C[],
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  extractSignalsFn: (candidate: C) => RankingSignals = extractSignals as (candidate: C) => RankingSignals,
): RankedCandidate<C>[] {
  const ranked = candidates.map((candidate) => {
    const signals = extractSignalsFn(candidate);
    return { candidate, signals, federatedScore: computeFederatedScore(signals, weights) };
  });

  return ranked.sort((left, right) => {
    if (right.federatedScore !== left.federatedScore) return right.federatedScore - left.federatedScore;
    if (left.candidate.kind !== right.candidate.kind) return left.candidate.kind.localeCompare(right.candidate.kind);
    return left.candidate.id.localeCompare(right.candidate.id);
  });
}
