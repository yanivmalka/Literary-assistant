// Integration tests for the Phase 5.2 wiring added to ask-question/index.ts:
// existing chunk retrieval + runUnifiedRetrieval() + selectCandidates() +
// formatStructuredKnowledgeContext() + appendStructuredKnowledgeContext().
//
// ask-question/index.ts itself calls `Deno.serve(...)` at module scope, so it
// cannot be imported directly in a test (it would start a server). These
// tests instead exercise the exact same shared-module call sequence
// index.ts performs — the identical functions, called in the identical
// order — against a fake Supabase client, which is the same pattern already
// used by unified-retrieval-evidence.test.ts.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runUnifiedRetrieval } from "./unified-retrieval.ts";
import { selectCandidates } from "./selection.ts";
import { appendStructuredKnowledgeContext, formatStructuredKnowledgeContext } from "./structured-context.ts";
import type { QASource } from "./notebook-types.ts";

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
  return { from(table: string) { return new FakeQueryBuilder(db[table] ?? []); } };
}

function failingSupabase() {
  return {
    from(_table: string) {
      throw new Error("simulated unified retrieval failure");
    },
  };
}

const PROJECT_ID = "project-1";

/**
 * Replicates exactly the composition ask-question/index.ts performs in
 * Step 2b (unified retrieval -> select -> format, defensively guarded) and
 * Step 4 (append to the existing chunk-based context).
 */
async function buildQAContext(supabase: any, branchId: string | null, chunks: QASource[]): Promise<string> {
  const baseContext = chunks
    .map((s, i) => {
      const ref = s.chapterNumber ? `[Chapter ${s.chapterNumber}]` : `[Source ${i + 1}]`;
      return `${ref}\n${s.content}`;
    })
    .join("\n\n---\n\n");

  let structuredKnowledgeBlock = "";
  try {
    const unified = await runUnifiedRetrieval({
      supabase,
      projectId: PROJECT_ID,
      branchId,
      chunks,
      rawScope: { projectId: PROJECT_ID, branchId },
    });
    const structuredRanked = unified.ranked.filter((entry) => entry.candidate.kind !== "chunk");
    const selected = selectCandidates(structuredRanked, { maxTotal: 25 });
    structuredKnowledgeBlock = formatStructuredKnowledgeContext(selected);
  } catch {
    structuredKnowledgeBlock = "";
  }

  return appendStructuredKnowledgeContext(baseContext, structuredKnowledgeBlock);
}

const chunks: QASource[] = [
  { chunkId: "chunk-1", content: "David walked into the hall.", chapterNumber: 1, chapterTitle: null, page: 1, position: 0, versionId: "version-1", score: 5 },
];

Deno.test("existing chunk-only context is unchanged when there is no structured knowledge to add", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [], knowledge_branch_entities: [], knowledge_entity_values: [],
    knowledge_entity_value_evidence: [], knowledge_entity_mentions: [],
    knowledge_entity_relationships: [], knowledge_events: [],
  };
  const context = await buildQAContext(fakeSupabase(db), null, chunks);
  assertEquals(context, "[Chapter 1]\nDavid walked into the hall.");
});

Deno.test("a relevant entity and its value reach the QA context, clearly delimited from chunk passages", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [{
      id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
      description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
      review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
    knowledge_branch_entities: [],
    knowledge_entity_values: [{
      id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color",
      value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: null,
    }],
    knowledge_entity_value_evidence: [],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [],
    knowledge_events: [],
  };
  const context = await buildQAContext(fakeSupabase(db), null, chunks);

  assertEquals(context.includes("David walked into the hall."), true);
  assertEquals(context.includes("Structured knowledge from the story's knowledge base:"), true);
  assertEquals(context.includes("[Entity] David (character)"), true);
  assertEquals(context.includes(`[Value] hair_color: {"value":"black"}`), true);
});

Deno.test("relationships and events reach the QA context when selected", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [
      {
        id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
        description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
        review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
      },
      {
        id: "main-goliath", canonical_name: "Goliath", entity_type: "character", entity_types: null,
        description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
        review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
      },
    ],
    knowledge_branch_entities: [],
    knowledge_entity_values: [],
    knowledge_entity_value_evidence: [],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [{
      id: "rel-1", branch_id: null, source_entity_id: "main-david", target_entity_id: "main-goliath",
      relationship_type: "rival", operation: "add", review_status: "approved", document_id: null, version_id: null, raw_extraction_id: null,
      project_id: PROJECT_ID,
    }],
    knowledge_events: [{
      id: "event-1", branch_id: null, name: "The battle", description: "It began at dawn",
      attributes: {}, document_id: null, version_id: null, raw_extraction_id: null,
      project_id: PROJECT_ID,
    }],
  };
  const context = await buildQAContext(fakeSupabase(db), null, chunks);

  assertEquals(context.includes("[Relationship] main-david —rival→ main-goliath"), true);
  assertEquals(context.includes("[Event] The battle: It began at dawn"), true);
});

Deno.test("Main/Branch resolution is preserved: only the selected branch's overlay reaches context, not another branch's", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [{
      id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
      description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
      review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
    knowledge_branch_entities: [],
    knowledge_entity_values: [
      { id: "value-main", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
      { id: "value-branch-2", entity_id: "main-david", branch_id: "branch-2", field_path: "hair_color", value_json: { value: "green" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
    ],
    knowledge_entity_value_evidence: [],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [],
    knowledge_events: [],
  };

  // Selecting branch-1 — neither Main's baseline value nor branch-2's override should show branch-2's data.
  const context = await buildQAContext(fakeSupabase(db), "branch-1", chunks);
  assertEquals(context.includes(`{"value":"black"}`), true);
  assertEquals(context.includes(`{"value":"green"}`), false);
});

Deno.test("evidence metadata is preserved internally through the selection step (present on the ranked candidate that fed formatting)", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [{
      id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
      description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
      review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
    knowledge_branch_entities: [],
    knowledge_entity_values: [{
      id: "value-1", entity_id: "main-david", branch_id: null, field_path: "hair_color",
      value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: "extraction-3",
    }],
    knowledge_entity_value_evidence: [{
      id: "ev-1", value_id: "value-1", chunk_id: "chunk-1", quote: "black hair",
      position_start: 10, position_end: 20, page_number: 1, raw_extraction_id: "extraction-3",
    }],
    knowledge_entity_mentions: [],
    knowledge_entity_relationships: [],
    knowledge_events: [],
  };

  const unified = await runUnifiedRetrieval({
    supabase: fakeSupabase(db),
    projectId: PROJECT_ID,
    branchId: null,
    chunks,
    rawScope: { projectId: PROJECT_ID },
  });
  const selected = selectCandidates(unified.ranked.filter((e) => e.candidate.kind !== "chunk"), { maxTotal: 25 });
  const valueEntry = selected.find((entry) => entry.candidate.kind === "value");
  if (!valueEntry) throw new Error("expected a selected value candidate");
  assertEquals(valueEntry.candidate.evidenceRecords, [{
    kind: "value-evidence", id: "ev-1", chunkId: "chunk-1", versionId: null, documentId: null,
    startPosition: 10, endPosition: 20, fieldPath: "hair_color", sourceType: "value_evidence",
    confidence: null, metadata: { rawExtractionId: "extraction-3" },
  }]);
  // The rendered text itself carries no fabricated citation/position beyond the candidate's own text.
  const block = formatStructuredKnowledgeContext(selected);
  assertEquals(block.includes("position"), false);
});

Deno.test("empty structured retrieval does not remove chunks from context", async () => {
  const db: Record<string, Row[]> = {
    knowledge_entities: [], knowledge_branch_entities: [], knowledge_entity_values: [],
    knowledge_entity_value_evidence: [], knowledge_entity_mentions: [],
    knowledge_entity_relationships: [], knowledge_events: [],
  };
  const context = await buildQAContext(fakeSupabase(db), null, chunks);
  assertEquals(context, "[Chapter 1]\nDavid walked into the hall.");
});

Deno.test("unified retrieval failure falls back to the existing chunk-only context, never rejecting the request", async () => {
  const context = await buildQAContext(failingSupabase(), null, chunks);
  assertEquals(context, "[Chapter 1]\nDavid walked into the hall.");
});
