import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RetrievalCandidate } from "./retrieval-candidate.ts";
import type { RetrievalCandidateWithEvidence, UnifiedEvidence } from "./evidence.ts";
import { rankCandidates } from "./ranking.ts";
import { appendStructuredKnowledgeContext, formatStructuredKnowledgeContext } from "./structured-context.ts";

function candidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    kind: "entity",
    id: "e1",
    projectId: "project-1",
    branchId: null,
    layer: "main",
    text: "David (character)",
    score: null,
    confidence: null,
    sourceChunkIds: [],
    versionIds: [],
    evidence: [],
    ...overrides,
  };
}

const sampleEvidence: UnifiedEvidence = {
  kind: "mention",
  id: "mention-1",
  chunkId: "chunk-1",
  versionId: null,
  documentId: null,
  startPosition: null,
  endPosition: null,
  fieldPath: null,
  sourceType: "mention",
  confidence: null,
  metadata: {},
};

Deno.test("formats mixed entity/value/relationship/event candidates as a bulleted, kind-labeled block, skipping chunks", () => {
  const chunk = candidate({ kind: "chunk", id: "c1", text: "his black hair caught the light", score: 5 });
  const entity = candidate({ kind: "entity", id: "e1", text: "David (character)" });
  const value = candidate({ kind: "value", id: "e1:hair_color", text: `hair_color: "black"` });
  const relationship = candidate({ kind: "relationship", id: "r1", text: "e1 —rival→ e2" });
  const event = candidate({ kind: "event", id: "ev1", text: "The battle: it began at dawn" });

  const ranked = rankCandidates([chunk, entity, value, relationship, event]);
  const block = formatStructuredKnowledgeContext(ranked);

  // rankCandidates ties on federatedScore (0 for all here) and tie-breaks by
  // kind then id, so the block order is deterministic but kind-alphabetical.
  assertEquals(
    block,
    [
      `- [Entity] David (character)`,
      `- [Event] The battle: it began at dawn`,
      `- [Relationship] e1 —rival→ e2`,
      `- [Value] hair_color: "black"`,
    ].join("\n"),
  );
});

Deno.test("an empty selection formats to an empty string", () => {
  assertEquals(formatStructuredKnowledgeContext([]), "");
});

Deno.test("evidence metadata on selected candidates survives formatting untouched (formatting never strips or reads it)", () => {
  const withEvidence: RetrievalCandidateWithEvidence = { ...candidate({ id: "e1" }), evidenceRecords: [sampleEvidence] };
  const ranked = rankCandidates([withEvidence]);
  formatStructuredKnowledgeContext(ranked);
  // The formatter is called for its return value only; the input candidates,
  // including their evidenceRecords, are never mutated.
  assertEquals(ranked[0].candidate.evidenceRecords, [sampleEvidence]);
});

Deno.test("appendStructuredKnowledgeContext appends a clearly delimited section when a structured block exists", () => {
  const base = "[Chapter 1]\nHe walked into the hall.";
  const result = appendStructuredKnowledgeContext(base, "- [Entity] David (character)");
  assertEquals(
    result,
    "[Chapter 1]\nHe walked into the hall.\n\n---\n\nStructured knowledge from the story's knowledge base:\n- [Entity] David (character)",
  );
});

Deno.test("appendStructuredKnowledgeContext returns the base chunk context unchanged when there is no structured block (empty structured retrieval never removes chunks)", () => {
  const base = "[Chapter 1]\nHe walked into the hall.";
  assertEquals(appendStructuredKnowledgeContext(base, ""), base);
});
