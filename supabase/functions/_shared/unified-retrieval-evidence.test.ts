import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runUnifiedRetrieval } from "./unified-retrieval.ts";
import type { QASource } from "./notebook-types.ts";

// ---------------------------------------------------------------------------
// Minimal fake Supabase query builder — supports exactly the .from/.select/
// .eq/.is/.in chain shapes `loadUnifiedRetrievalRows` actually issues, and is
// awaitable (thenable) like the real supabase-js query builder.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Filter = { column: string; type: "eq" | "is" | "in"; value: unknown };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column];
    if (filter.type === "in") return (filter.value as unknown[]).includes(actual);
    return actual === filter.value;
  });
}

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Filter[] = [];
  constructor(private rows: Row[]) {}
  select(_fields: string) { return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, type: "eq", value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ column, type: "is", value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, type: "in", value }); return this; }
  then<TResult1, TResult2>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = { data: this.rows.filter((row) => matches(row, this.filters)), error: null as null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(db[table] ?? []);
    },
  };
}

const PROJECT_ID = "project-1";

Deno.test("integration: a real value retrieved through runUnifiedRetrieval carries its actual evidence -> chunk -> position provenance", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [
      {
        id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
        description: "The king's son", attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
        review_status: "confirmed", version_id: "version-1", document_id: "doc-1", raw_extraction_id: "extraction-1",
        project_id: PROJECT_ID,
      },
    ],
    knowledge_branch_entities: [],
    knowledge_entity_values: [
      {
        id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color",
        value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: "extraction-3",
      },
    ],
    knowledge_entity_value_evidence: [
      {
        id: "ev-1", value_id: "value-1", chunk_id: "chunk-9", quote: "his black hair",
        position_start: 120, position_end: 135, page_number: 3, raw_extraction_id: "extraction-3",
      },
    ],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [],
    knowledge_events: [],
  };

  const chunks: QASource[] = [
    { chunkId: "chunk-9", content: "his black hair caught the light", chapterNumber: 1, chapterTitle: null, page: 3, position: 0, versionId: "version-1", score: 0.8 },
  ];

  const result = await runUnifiedRetrieval({
    supabase: fakeSupabase(db),
    projectId: PROJECT_ID,
    branchId: null,
    chunks,
    rawScope: { projectId: PROJECT_ID },
  });

  const valueCandidate = result.candidates.find((c) => c.kind === "value");
  if (!valueCandidate) throw new Error("expected a value candidate");
  assertEquals(valueCandidate.id, "main-david:hair_color");
  assertEquals(valueCandidate.evidenceRecords, [{
    kind: "value-evidence",
    id: "ev-1",
    chunkId: "chunk-9",
    versionId: null,
    documentId: null,
    startPosition: 120,
    endPosition: 135,
    fieldPath: "hair_color",
    sourceType: "value_evidence",
    confidence: null,
    metadata: { rawExtractionId: "extraction-3" },
  }]);

  // The evidence's chunkId genuinely resolves to a chunk present in this same retrieval.
  const referencedChunk = result.candidates.find((c) => c.kind === "chunk" && c.id === valueCandidate.evidenceRecords[0].chunkId);
  assertEquals(referencedChunk?.text, "his black hair caught the light");
});

Deno.test("integration: evidence for another branch's value never leaks into this branch's retrieval", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [
      {
        id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
        description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
        review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
      },
    ],
    knowledge_branch_entities: [
      { id: "overlay-1", branch_id: "branch-1", source_entity_id: "main-david", entity_id: "main-david", overrides: {}, rejected_fields: [] },
    ],
    knowledge_entity_values: [
      { id: "value-main", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
      { id: "value-branch-2", entity_id: "main-david", branch_id: "branch-2", field_path: "hair_color", value_json: { value: "green" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
    ],
    knowledge_entity_value_evidence: [
      { id: "ev-main", value_id: "value-main", chunk_id: "chunk-1", quote: null, position_start: null, position_end: null, page_number: null, raw_extraction_id: null },
      { id: "ev-other-branch", value_id: "value-branch-2", chunk_id: "chunk-leaked", quote: null, position_start: null, position_end: null, page_number: null, raw_extraction_id: null },
    ],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [],
    knowledge_events: [],
  };

  // Selecting branch-1 (not branch-2, which holds the "other" value/evidence).
  const result = await runUnifiedRetrieval({
    supabase: fakeSupabase(db),
    projectId: PROJECT_ID,
    branchId: "branch-1",
    chunks: [],
    rawScope: { projectId: PROJECT_ID, branchId: "branch-1" },
  });

  const valueCandidate = result.candidates.find((c) => c.kind === "value");
  if (!valueCandidate) throw new Error("expected a value candidate (the Main baseline, unmodified by branch-1)");
  assertEquals(valueCandidate.text, `hair_color: {"value":"black"}`);
  const evidenceChunkIds = valueCandidate.evidenceRecords.map((e) => e.chunkId);
  assertEquals(evidenceChunkIds.includes("chunk-leaked"), false);
  assertEquals(evidenceChunkIds, ["chunk-1"]);
});

Deno.test("Phase 4 integration: loadUnifiedRetrievalRows fetches document_chunks/document_versions and federates version/document/position onto the value's evidence", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [
      {
        id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
        description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
        review_status: "confirmed", version_id: "version-1", document_id: "doc-1", raw_extraction_id: null,
        project_id: PROJECT_ID,
      },
    ],
    knowledge_branch_entities: [],
    knowledge_entity_values: [
      {
        id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color",
        value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: "extraction-3",
      },
    ],
    knowledge_entity_value_evidence: [
      {
        id: "ev-1", value_id: "value-1", chunk_id: "chunk-9", quote: "his black hair",
        position_start: 120, position_end: 135, page_number: 3, raw_extraction_id: "extraction-3",
      },
    ],
    knowledge_entity_mentions: [{ id: "m-1", entity_id: "main-david", chunk_id: "chunk-9", page_number: 3, evidence: null }],
    knowledge_entity_relationships: [],
    knowledge_events: [],
    document_chunks: [{ id: "chunk-9", version_id: "version-1", position: 4, page: 3 }],
    document_versions: [{ id: "version-1", document_id: "doc-1" }],
  };

  const result = await runUnifiedRetrieval({
    supabase: fakeSupabase(db),
    projectId: PROJECT_ID,
    branchId: null,
    chunks: [],
    rawScope: { projectId: PROJECT_ID },
  });

  const valueEvidence = result.candidates.find((c) => c.kind === "value")!.evidenceRecords[0];
  assertEquals(valueEvidence.versionId, "version-1");
  assertEquals(valueEvidence.documentId, "doc-1");
  assertEquals(valueEvidence.metadata, { rawExtractionId: "extraction-3", chunkPosition: 4, page: 3 });

  const entry = result.sourceRegistry.find((e) => e.candidateId === "main-david:hair_color")!;
  assertEquals(entry.resolution, "chunk-grounded");
  assertEquals(entry.sources[0].versionId, "version-1");
  assertEquals(entry.sources[0].documentId, "doc-1");
});
