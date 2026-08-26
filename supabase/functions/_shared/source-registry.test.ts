import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RetrievalCandidate } from "./retrieval-candidate.ts";
import type { RetrievalCandidateWithEvidence, UnifiedEvidence } from "./evidence.ts";
import { rankCandidates } from "./ranking.ts";
import { selectCandidates } from "./selection.ts";
import { buildSourceRegistry, resolveCandidateSource } from "./source-registry.ts";
import { runUnifiedRetrieval } from "./unified-retrieval.ts";
import type { QASource } from "./notebook-types.ts";

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

function withEvidence(c: RetrievalCandidate, evidenceRecords: UnifiedEvidence[]): RetrievalCandidateWithEvidence {
  return { ...c, evidenceRecords };
}

const mentionEvidence: UnifiedEvidence = {
  kind: "mention", id: "mention-1", chunkId: "chunk-1", versionId: null, documentId: null,
  startPosition: null, endPosition: null, fieldPath: null, sourceType: "mention", confidence: null,
  metadata: { pageNumber: 3 },
};

const valueEvidence: UnifiedEvidence = {
  kind: "value-evidence", id: "ev-1", chunkId: "chunk-9", versionId: null, documentId: null,
  startPosition: 120, endPosition: 135, fieldPath: "hair_color", sourceType: "value_evidence", confidence: null,
  metadata: {},
};

const extractionProvenance: UnifiedEvidence = {
  kind: "extraction-provenance", id: "extraction-3", chunkId: null, versionId: "version-1", documentId: "doc-1",
  startPosition: null, endPosition: null, fieldPath: null, sourceType: "entity", confidence: null, metadata: {},
};

// --- 1. Existing chunk sources remain unchanged -----------------------------

Deno.test("a chunk candidate's source maps to its own real chunk id/version, chunk-grounded, no evidence records read", () => {
  const chunk = candidate({ kind: "chunk", id: "chunk-1", versionIds: ["version-1"] });
  const withEv = withEvidence(chunk, []);
  const entry = resolveCandidateSource(withEv);
  assertEquals(entry, {
    candidateId: "chunk-1",
    candidateKind: "chunk",
    resolution: "chunk-grounded",
    sources: [{
      evidenceId: "chunk-1", evidenceKind: "mention", chunkId: "chunk-1", versionId: "version-1",
      documentId: null, startPosition: null, endPosition: null, fieldPath: null,
    }],
  });
});

// --- 2. Entity with a real mention maps to its real chunk -------------------

Deno.test("a selected Entity with a real mention produces a source mapping to its real chunk", () => {
  const entity = withEvidence(candidate({ kind: "entity", id: "e-david" }), [mentionEvidence]);
  const entry = resolveCandidateSource(entity);
  assertEquals(entry.resolution, "chunk-grounded");
  assertEquals(entry.sources, [{
    evidenceId: "mention-1", evidenceKind: "mention", chunkId: "chunk-1", versionId: null,
    documentId: null, startPosition: null, endPosition: null, fieldPath: null,
  }]);
});

// --- 3. Value with real value evidence maps to real chunk + positions -------

Deno.test("a selected Value with real value evidence produces a source mapping including its real chunk and positions", () => {
  const value = withEvidence(candidate({ kind: "value", id: "e1:hair_color" }), [valueEvidence]);
  const entry = resolveCandidateSource(value);
  assertEquals(entry.resolution, "chunk-grounded");
  assertEquals(entry.sources, [{
    evidenceId: "ev-1", evidenceKind: "value-evidence", chunkId: "chunk-9", versionId: null,
    documentId: null, startPosition: 120, endPosition: 135, fieldPath: "hair_color",
  }]);
});

// --- 4. Value without chunk evidence produces no fabricated source ----------

Deno.test("a Value with no evidence records produces no fabricated source — resolution is 'unresolved', not a made-up location", () => {
  const value = withEvidence(candidate({ kind: "value", id: "e1:hair_color" }), []);
  const entry = resolveCandidateSource(value);
  assertEquals(entry.resolution, "unresolved");
  assertEquals(entry.sources, []);
});

// --- 5 & 6. Relationship/Event: extraction provenance only, never a fabricated chunk ---

Deno.test("a Relationship candidate with real extraction provenance resolves to extraction-only, never a fabricated chunk", () => {
  const relationship = withEvidence(candidate({ kind: "relationship", id: "r1" }), [{ ...extractionProvenance, sourceType: "relationship" }]);
  const entry = resolveCandidateSource(relationship);
  assertEquals(entry.resolution, "extraction-only");
  assertEquals(entry.sources, [{
    evidenceId: "extraction-3", evidenceKind: "extraction-provenance", chunkId: null,
    versionId: "version-1", documentId: "doc-1", startPosition: null, endPosition: null, fieldPath: null,
  }]);
  assertEquals(entry.sources.every((s) => s.chunkId === null), true);
});

Deno.test("an Event candidate with real extraction provenance resolves to extraction-only, never a fabricated chunk", () => {
  const event = withEvidence(candidate({ kind: "event", id: "ev1" }), [{ ...extractionProvenance, sourceType: "event" }]);
  const entry = resolveCandidateSource(event);
  assertEquals(entry.resolution, "extraction-only");
  assertEquals(entry.sources.every((s) => s.chunkId === null), true);
});

Deno.test("a Relationship/Event candidate with no provenance columns resolves to 'unresolved', not a fabricated placeholder", () => {
  const relationship = withEvidence(candidate({ kind: "relationship", id: "r-none" }), []);
  const event = withEvidence(candidate({ kind: "event", id: "ev-none" }), []);
  assertEquals(resolveCandidateSource(relationship).resolution, "unresolved");
  assertEquals(resolveCandidateSource(event).resolution, "unresolved");
});

// --- Main/Branch isolation ----------------------------------------------------

Deno.test("Main/Branch evidence remains isolated — the registry only ever reads the evidence already attached to each candidate, never cross-candidate", async () => {
  type Row = Record<string, unknown>;
  class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
    private filters: { column: string; type: "eq" | "is" | "in"; value: unknown }[] = [];
    constructor(private rows: Row[]) {}
    select(_f: string) { return this; }
    eq(c: string, v: unknown) { this.filters.push({ column: c, type: "eq", value: v }); return this; }
    is(c: string, v: unknown) { this.filters.push({ column: c, type: "is", value: v }); return this; }
    in(c: string, v: unknown[]) { this.filters.push({ column: c, type: "in", value: v }); return this; }
    then<T1, T2>(
      onf?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
      onr?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      const data = this.rows.filter((row) =>
        this.filters.every((f) => f.type === "in" ? (f.value as unknown[]).includes(row[f.column]) : row[f.column] === f.value)
      );
      return Promise.resolve({ data, error: null as null }).then(onf, onr);
    }
  }
  function fakeSupabase(db: Record<string, Row[]>) {
    return { from(t: string) { return new FakeQueryBuilder(db[t] ?? []); } };
  }

  const PROJECT_ID = "project-1";
  const db: Record<string, Row[]> = {
    knowledge_entities: [{
      id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null, description: null,
      attributes: {}, structured_fields: {}, layer: "main", branch_id: null, review_status: "confirmed",
      version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
    knowledge_branch_entities: [],
    knowledge_entity_values: [
      { id: "value-main", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
      { id: "value-branch-2", entity_id: "main-david", branch_id: "branch-2", field_path: "hair_color", value_json: { value: "green" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
    ],
    knowledge_entity_value_evidence: [
      { id: "ev-main", value_id: "value-main", chunk_id: "chunk-main", quote: null, position_start: null, position_end: null, page_number: null, raw_extraction_id: null },
      { id: "ev-branch-2", value_id: "value-branch-2", chunk_id: "chunk-leaked", quote: null, position_start: null, position_end: null, page_number: null, raw_extraction_id: null },
    ],
    knowledge_entity_mentions: [], knowledge_entity_relationships: [], knowledge_events: [],
  };

  // Selecting branch-1 (not branch-2, which holds the "other" value/evidence).
  const unified = await runUnifiedRetrieval({
    supabase: fakeSupabase(db), projectId: PROJECT_ID, branchId: "branch-1", chunks: [],
    rawScope: { projectId: PROJECT_ID, branchId: "branch-1" },
  });
  const selected = selectCandidates(unified.ranked.filter((e) => e.candidate.kind !== "chunk"));
  const registry = buildSourceRegistry(selected);

  const valueSource = registry.find((entry) => entry.candidateKind === "value");
  if (!valueSource) throw new Error("expected a value source entry");
  const chunkIds = valueSource.sources.map((s) => s.chunkId);
  assertEquals(chunkIds, ["chunk-main"]);
  assertEquals(chunkIds.includes("chunk-leaked"), false);
});

// --- Candidate evidence survives from selection into the registry -----------

Deno.test("candidate evidence survives from ranking through selection into the source registry unchanged", () => {
  const value = withEvidence(candidate({ kind: "value", id: "e1:hair_color", score: null }), [valueEvidence]);
  const ranked = rankCandidates([value]);
  const selected = selectCandidates(ranked, { maxTotal: 25 });
  const registry = buildSourceRegistry(selected);
  assertEquals(registry, [{
    candidateId: "e1:hair_color",
    candidateKind: "value",
    resolution: "chunk-grounded",
    sources: [{
      evidenceId: "ev-1", evidenceKind: "value-evidence", chunkId: "chunk-9", versionId: null,
      documentId: null, startPosition: 120, endPosition: 135, fieldPath: "hair_color",
    }],
  }]);
  // The original selected candidate object (and its evidenceRecords) is untouched.
  assertEquals(selected[0].candidate.evidenceRecords, [valueEvidence]);
});

// --- Empty/failing unified retrieval leaves existing source behavior unchanged ---

Deno.test("empty structured retrieval produces an empty registry, and QASource-derived chunk sources are unaffected", () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-1", content: "text", chapterNumber: 1, chapterTitle: null, page: null,
    position: 0, versionId: "version-1", score: 1,
  }];
  const chunkCandidate = candidate({ kind: "chunk", id: chunks[0].chunkId, versionIds: [chunks[0].versionId] });
  const withEv = withEvidence(chunkCandidate, []);
  const ranked = rankCandidates([withEv]);
  const selected = selectCandidates(ranked.filter((e) => e.candidate.kind !== "chunk")); // structured-only, as index.ts does
  assertEquals(buildSourceRegistry(selected), []);
  // The chunk candidate itself, if included, still resolves faithfully — nothing about QASource-derived data changes.
  assertEquals(resolveCandidateSource(withEv).sources[0].chunkId, "chunk-1");
});

Deno.test("buildSourceRegistry does not mutate its input", () => {
  const value = withEvidence(candidate({ kind: "value", id: "v1" }), [valueEvidence]);
  const ranked = rankCandidates([value]);
  const selected = selectCandidates(ranked);
  const snapshot = selected.map((e) => ({ ...e }));
  buildSourceRegistry(selected);
  assertEquals(selected.map((e) => ({ ...e })), snapshot);
});
