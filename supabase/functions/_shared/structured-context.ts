/**
 * Phase 5.2: renders already-selected structured candidates (Phase 5.1's
 * `selectCandidates()` output, over Phase 4's ranked Phase 1-3 candidates)
 * into a deterministic, clearly delimited text block that can be appended to
 * the existing QA `context` string.
 *
 * Pure and read-only: never re-resolves, re-filters, or re-ranks anything —
 * it only formats candidates it is handed, in the order it is handed them,
 * and never invents a citation or position beyond what each candidate's
 * `text`/`kind` already carries.
 */

import type { RetrievalCandidate, RetrievalCandidateKind } from "./retrieval-candidate.ts";
import type { RankedCandidate } from "./ranking.ts";

const KIND_LABELS: Record<Exclude<RetrievalCandidateKind, "chunk">, string> = {
  entity: "Entity",
  value: "Value",
  relationship: "Relationship",
  event: "Event",
};

/**
 * Formats the non-chunk structured candidates as a bulleted list, one line
 * per candidate, in the exact order given (selection's already-ranked
 * order). Chunk candidates are skipped — they already reach `context`
 * through the existing chunk-rendering path and are not duplicated here.
 * Returns `""` when there is nothing to render, so callers can skip
 * appending anything.
 */
export function formatStructuredKnowledgeContext<C extends RetrievalCandidate>(
  selected: readonly RankedCandidate<C>[],
): string {
  const lines = selected
    .filter((entry) => entry.candidate.kind !== "chunk")
    .map((entry) => {
      const label = KIND_LABELS[entry.candidate.kind as Exclude<RetrievalCandidateKind, "chunk">];
      return `- [${label}] ${entry.candidate.text}`;
    });

  return lines.join("\n");
}

const STRUCTURED_KNOWLEDGE_HEADER = "Structured knowledge from the story's knowledge base:";

/**
 * Appends the structured-knowledge block to an existing chunk-based context
 * string, clearly delimited from the chunk passages. Returns `baseContext`
 * unchanged when there is no structured block to add, so empty structured
 * retrieval never alters the existing chunk-only context.
 */
export function appendStructuredKnowledgeContext(baseContext: string, structuredBlock: string): string {
  if (!structuredBlock) return baseContext;
  return `${baseContext}\n\n---\n\n${STRUCTURED_KNOWLEDGE_HEADER}\n${structuredBlock}`;
}
