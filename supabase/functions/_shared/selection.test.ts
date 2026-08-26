import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RetrievalCandidate } from "./retrieval-candidate.ts";
import type { RetrievalCandidateWithEvidence, UnifiedEvidence } from "./evidence.ts";
import { rankCandidates } from "./ranking.ts";
import { selectCandidates } from "./selection.ts";

function candidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    kind: "chunk",
    id: "c1",
    projectId: "project-1",
    branchId: null,
    layer: "main",
    text: "text",
    score: 1,
    confidence: null,
    sourceChunkIds: [],
    versionIds: [],
    evidence: [],
    ...overrides,
  };
}

function withEvidence(c: RetrievalCandidate, evidenceRecords: UnifiedEvidence[]): RetrievalCandidateWithEvidence {
  return { ...c, evidenceRecords };
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

Deno.test("selects across a mix of chunks/entities/values/relationships/events, honoring maxTotal", () => {
  const mixed = [
    candidate({ kind: "chunk", id: "c1", score: 9 }),
    candidate({ kind: "entity", id: "e1", score: null }),
    candidate({ kind: "value", id: "v1", score: null }),
    candidate({ kind: "relationship", id: "r1", score: null }),
    candidate({ kind: "event", id: "ev1", score: null }),
  ];
  const ranked = rankCandidates(mixed);
  const selected = selectCandidates(ranked, { maxTotal: 3 });
  assertEquals(selected.length, 3);
  // Selection preserves the ranked order exactly (chunk c1 has the only real score, so it leads).
  assertEquals(selected.map((s) => s.candidate.id), ranked.slice(0, 3).map((s) => s.candidate.id));
});

Deno.test("selection is deterministic for the same ranked input and options", () => {
  const mixed = [
    candidate({ kind: "chunk", id: "c1", score: 3 }),
    candidate({ kind: "chunk", id: "c2", score: 5 }),
    candidate({ kind: "entity", id: "e1" }),
  ];
  const ranked = rankCandidates(mixed);
  const first = selectCandidates(ranked, { maxTotal: 2 }).map((s) => s.candidate.id);
  const second = selectCandidates(ranked, { maxTotal: 2 }).map((s) => s.candidate.id);
  assertEquals(first, second);
});

Deno.test("evidence and all other candidate metadata pass through selection completely unchanged", () => {
  const entityWithEvidence = withEvidence(candidate({ kind: "entity", id: "e1", score: null }), [sampleEvidence]);
  const ranked = rankCandidates([entityWithEvidence]);
  const [selected] = selectCandidates(ranked);
  assertEquals(selected.candidate, entityWithEvidence);
  assertEquals((selected.candidate as RetrievalCandidateWithEvidence).evidenceRecords, [sampleEvidence]);
  assertEquals(selected.signals, ranked[0].signals);
  assertEquals(selected.federatedScore, ranked[0].federatedScore);
});

Deno.test("Main and Branch-only candidates are both selectable — selection never filters by layer/branch", () => {
  const mainEntity = candidate({ kind: "entity", id: "e-main", layer: "main", branchId: null, score: null });
  const branchEntity = candidate({ kind: "entity", id: "e-branch", layer: "branch-only", branchId: "branch-1", score: null });
  const ranked = rankCandidates([mainEntity, branchEntity]);
  const selected = selectCandidates(ranked);
  assertEquals(selected.length, 2);
  assertEquals(new Set(selected.map((s) => s.candidate.branchId)), new Set([null, "branch-1"]));
});

Deno.test("empty structured retrieval (empty ranked list) selects nothing", () => {
  assertEquals(selectCandidates([]), []);
});

Deno.test("candidates with equal scores are selected in the order rankCandidates already tie-broke them", () => {
  const a = candidate({ kind: "entity", id: "b-entity", score: null });
  const b = candidate({ kind: "entity", id: "a-entity", score: null });
  const ranked = rankCandidates([a, b]);
  const selected = selectCandidates(ranked);
  assertEquals(selected.map((s) => s.candidate.id), ["a-entity", "b-entity"]);
});

Deno.test("maxPerKind caps candidates per kind without exceeding maxTotal", () => {
  const mixed = [
    candidate({ kind: "chunk", id: "c1", score: 9 }),
    candidate({ kind: "chunk", id: "c2", score: 8 }),
    candidate({ kind: "chunk", id: "c3", score: 7 }),
    candidate({ kind: "entity", id: "e1", score: null }),
  ];
  const ranked = rankCandidates(mixed);
  const selected = selectCandidates(ranked, { maxPerKind: { chunk: 2 } });
  assertEquals(selected.filter((s) => s.candidate.kind === "chunk").length, 2);
  assertEquals(selected.some((s) => s.candidate.kind === "entity"), true);
});

Deno.test("selection does not mutate the input ranked list or its entries", () => {
  const mixed = [candidate({ kind: "chunk", id: "c1", score: 3 }), candidate({ kind: "chunk", id: "c2", score: 9 })];
  const ranked = rankCandidates(mixed);
  const rankedSnapshot = ranked.map((r) => ({ ...r }));
  const inputArraySnapshot = [...ranked];

  selectCandidates(ranked, { maxTotal: 1 });

  assertEquals(ranked, inputArraySnapshot);
  assertEquals(ranked.map((r) => ({ ...r })), rankedSnapshot);
});
