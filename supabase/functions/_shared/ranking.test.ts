import { assertEquals, assertNotStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RetrievalCandidate } from "./retrieval-candidate.ts";
import type { RetrievalCandidateWithEvidence, UnifiedEvidence } from "./evidence.ts";
import {
  DEFAULT_RANKING_WEIGHTS,
  extractSignals,
  rankCandidates,
  scoreSignal,
  type RankingWeights,
} from "./ranking.ts";

function chunkCandidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    kind: "chunk",
    id: "c1",
    projectId: "project-1",
    branchId: null,
    layer: "main",
    text: "text",
    score: 3,
    confidence: null,
    sourceChunkIds: ["c1"],
    versionIds: ["v1"],
    evidence: [],
    ...overrides,
  };
}

function entityCandidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
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

function withEvidence(
  candidate: RetrievalCandidate,
  evidenceRecords: UnifiedEvidence[],
): RetrievalCandidateWithEvidence {
  return { ...candidate, evidenceRecords };
}

const mentionEvidence: UnifiedEvidence = {
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

// --- cross-kind ranking ------------------------------------------------------

Deno.test("candidates from every kind can be ranked together in one list", () => {
  const relationship: RetrievalCandidate = {
    kind: "relationship", id: "r1", projectId: "project-1", branchId: null, layer: "main",
    text: "a -> b", score: null, confidence: null, sourceChunkIds: [], versionIds: [], evidence: [],
  };
  const event: RetrievalCandidate = {
    kind: "event", id: "ev1", projectId: "project-1", branchId: null, layer: "main",
    text: "The battle", score: null, confidence: null, sourceChunkIds: [], versionIds: [], evidence: [],
  };
  const value: RetrievalCandidate = {
    kind: "value", id: "e1:hair_color", projectId: "project-1", branchId: null, layer: "main",
    text: "hair_color: black", score: null, confidence: null, sourceChunkIds: [], versionIds: [], evidence: [],
  };
  const ranked = rankCandidates([chunkCandidate(), entityCandidate(), value, relationship, event]);
  assertEquals(ranked.length, 5);
  assertEquals(new Set(ranked.map((r) => r.candidate.kind)).size, 5);
});

// --- determinism --------------------------------------------------------------

Deno.test("ranking is deterministic across repeated runs", () => {
  const candidates = [
    chunkCandidate({ id: "c1", score: 1 }),
    chunkCandidate({ id: "c2", score: 5 }),
    entityCandidate({ id: "e1" }),
  ];
  const first = rankCandidates(candidates).map((r) => r.candidate.id);
  const second = rankCandidates(candidates).map((r) => r.candidate.id);
  assertEquals(first, second);
});

Deno.test("equal federated scores are tie-broken deterministically by kind then id", () => {
  const a = entityCandidate({ id: "b-entity" });
  const b = entityCandidate({ id: "a-entity" });
  const ranked = rankCandidates([a, b]);
  assertEquals(ranked.map((r) => r.candidate.id), ["a-entity", "b-entity"]);

  // Re-run with reversed input order — tie-break must not depend on input order.
  const rankedReversed = rankCandidates([b, a]);
  assertEquals(rankedReversed.map((r) => r.candidate.id), ["a-entity", "b-entity"]);
});

// --- evidence influence, without inventing evidence --------------------------

Deno.test("stronger (more) evidence improves ranking, without inventing evidence content", () => {
  const weak = withEvidence(entityCandidate({ id: "e-weak" }), [mentionEvidence]);
  const strong = withEvidence(entityCandidate({ id: "e-strong" }), [mentionEvidence, mentionEvidence, mentionEvidence]);
  const ranked = rankCandidates([weak, strong]);
  assertEquals(ranked.map((r) => r.candidate.id), ["e-strong", "e-weak"]);
  // The evidence itself is passed through unmodified — nothing fabricated.
  assertEquals(ranked[0].candidate === strong, true);
  assertEquals((ranked[0].candidate as RetrievalCandidateWithEvidence).evidenceRecords.length, 3);
});

Deno.test("a candidate with no evidenceRecords property is treated as evidence-unavailable (null), not zero-scored the same way as empty evidence", () => {
  const noEvidenceTracked = extractSignals(entityCandidate({ id: "e1" }));
  assertEquals(noEvidenceTracked.evidenceRelevance, null);

  const emptyEvidenceTracked = extractSignals(withEvidence(entityCandidate({ id: "e2" }), []));
  assertEquals(emptyEvidenceTracked.evidenceRelevance, 0);
});

// --- confidence only affects ranking through the configured rule -------------

Deno.test("confidence affects ranking only through the configured weight", () => {
  const highConfidence = entityCandidate({ id: "e-high", confidence: 0.9 });
  const lowConfidence = entityCandidate({ id: "e-low", confidence: 0.1 });

  const weights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, confidence: 1, mainBranchSource: 0 };
  const ranked = rankCandidates([lowConfidence, highConfidence], weights);
  assertEquals(ranked.map((r) => r.candidate.id), ["e-high", "e-low"]);

  const zeroWeighted: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, confidence: 0, mainBranchSource: 0 };
  const rankedNoConfidence = rankCandidates([lowConfidence, highConfidence], zeroWeighted);
  assertEquals(rankedNoConfidence[0].federatedScore, rankedNoConfidence[1].federatedScore);
});

// --- Main/Branch is a ranking signal only, never a resolution mechanism ------

Deno.test("Main/Branch information is read only as an explicit ranking signal, never altering which candidates are present", () => {
  const mainEntity = entityCandidate({ id: "e-main", layer: "main", branchId: null });
  const branchEntity = entityCandidate({ id: "e-branch", layer: "branch-only", branchId: "branch-1" });

  const weights: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, mainBranchSource: 1 };
  const ranked = rankCandidates([branchEntity, mainEntity], weights);
  // Main ranks above Branch-only purely as a score effect...
  assertEquals(ranked.map((r) => r.candidate.id), ["e-main", "e-branch"]);
  // ...but both candidates are still present — ranking never removes/filters, only orders.
  assertEquals(ranked.length, 2);

  const withoutSignal: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, mainBranchSource: 0 };
  const rankedNoSignal = rankCandidates([branchEntity, mainEntity], withoutSignal);
  assertEquals(rankedNoSignal.length, 2);
  assertEquals(rankedNoSignal[0].federatedScore, rankedNoSignal[1].federatedScore);
});

// --- chunks retain their original retrieval score -----------------------------

Deno.test("chunks retain their original retrieval score after ranking, as a separate federatedScore", () => {
  const chunk = chunkCandidate({ id: "c1", score: 0.42 });
  const [ranked] = rankCandidates([chunk]);
  assertEquals(ranked.candidate.score, 0.42);
  assertNotStrictEquals(ranked.federatedScore, undefined);
});

// --- candidates with no evidence are handled correctly ------------------------

Deno.test("a candidate with no evidence at all still ranks correctly using its other signals", () => {
  const chunk = chunkCandidate({ id: "c1", score: 7 });
  const [ranked] = rankCandidates([chunk]);
  assertEquals(ranked.signals.evidenceRelevance, null);
  assertEquals(ranked.federatedScore, 7 * DEFAULT_RANKING_WEIGHTS.lexicalRelevance + 1 * DEFAULT_RANKING_WEIGHTS.mainBranchSource);
});

// --- empty input ---------------------------------------------------------------

Deno.test("empty input returns an empty ranked result", () => {
  assertEquals(rankCandidates([]), []);
});

// --- no mutation of original candidates ----------------------------------------

Deno.test("ranking does not mutate the original candidate objects or input array order", () => {
  const c1 = chunkCandidate({ id: "c1", score: 1 });
  const c2 = chunkCandidate({ id: "c2", score: 9 });
  const input = [c1, c2];
  const inputSnapshot = [...input];
  const c1Snapshot = { ...c1 };
  const c2Snapshot = { ...c2 };

  rankCandidates(input);

  assertEquals(input, inputSnapshot);
  assertEquals(input[0], c1Snapshot);
  assertEquals(input[1], c2Snapshot);
  assertEquals(c1, c1Snapshot);
  assertEquals(c2, c2Snapshot);
});

// --- signal / weight primitives -------------------------------------------------

Deno.test("scoreSignal treats a null (unavailable) signal as contributing exactly 0, regardless of weight", () => {
  assertEquals(scoreSignal(null, 100), 0);
  assertEquals(scoreSignal(null, 0), 0);
});

Deno.test("scoreSignal multiplies a real signal by its configured weight", () => {
  assertEquals(scoreSignal(0.5, 2), 1);
  assertEquals(scoreSignal(1, 0), 0);
});

Deno.test("default weights are 0 for every signal the current retrieval layer does not actually produce", () => {
  assertEquals(DEFAULT_RANKING_WEIGHTS.semanticRelevance, 0);
  assertEquals(DEFAULT_RANKING_WEIGHTS.entityRelevance, 0);
  assertEquals(DEFAULT_RANKING_WEIGHTS.chunkProximity, 0);
  assertEquals(DEFAULT_RANKING_WEIGHTS.relationshipRelevance, 0);
  assertEquals(DEFAULT_RANKING_WEIGHTS.eventRelevance, 0);
});

Deno.test("extractSignals never fabricates semantic, entity, relationship, event, or proximity relevance", () => {
  const signals = extractSignals(entityCandidate());
  assertEquals(signals.semanticRelevance, null);
  assertEquals(signals.entityRelevance, null);
  assertEquals(signals.chunkProximity, null);
  assertEquals(signals.relationshipRelevance, null);
  assertEquals(signals.eventRelevance, null);
});
