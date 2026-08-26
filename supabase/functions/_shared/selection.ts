/**
 * Phase 5.1: Selection layer.
 *
 * A pure layer on top of Phase 4's `rankCandidates()` output. Its only job is
 * to select the most relevant already-ranked candidates for eventual QA
 * context — it does not re-resolve Main/Branch, re-filter structured
 * knowledge, or re-rank. It trusts the ranking order it is given and simply
 * decides how many (and, optionally, which mix) of the already-ranked
 * candidates to keep, preserving each `RankedCandidate` — including its
 * `evidenceRecords` and every other field — completely unchanged.
 *
 * Not wired into `ask-question/index.ts` yet.
 */

import type { RetrievalCandidate, RetrievalCandidateKind } from "./retrieval-candidate.ts";
import type { RankedCandidate } from "./ranking.ts";

export interface SelectionOptions {
  /** Maximum total candidates to select. `undefined` = no overall cap. */
  maxTotal?: number;
  /** Maximum candidates to select per `kind`. `undefined` = no per-kind cap. */
  maxPerKind?: Partial<Record<RetrievalCandidateKind, number>>;
}

/**
 * Selects a prefix of the already-ranked list, honoring an optional overall
 * cap and optional per-kind caps. Never reorders — the input's ranking order
 * (already deterministic per Phase 4) is preserved exactly, so selection
 * itself stays deterministic for the same input and options. Never mutates
 * the input array or any `RankedCandidate`/`candidate` object within it.
 */
export function selectCandidates<C extends RetrievalCandidate>(
  ranked: readonly RankedCandidate<C>[],
  options: SelectionOptions = {},
): RankedCandidate<C>[] {
  const { maxTotal, maxPerKind } = options;
  const perKindCount = new Map<RetrievalCandidateKind, number>();
  const selected: RankedCandidate<C>[] = [];

  for (const entry of ranked) {
    if (maxTotal !== undefined && selected.length >= maxTotal) break;

    const kindCap = maxPerKind?.[entry.candidate.kind];
    if (kindCap !== undefined) {
      const countSoFar = perKindCount.get(entry.candidate.kind) ?? 0;
      if (countSoFar >= kindCap) continue;
      perKindCount.set(entry.candidate.kind, countSoFar + 1);
    }

    selected.push(entry);
  }

  return selected;
}
