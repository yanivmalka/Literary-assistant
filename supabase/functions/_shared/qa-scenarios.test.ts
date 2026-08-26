// Phase 6: real-QA-scenario validation of the Phase 5/5.1/5.2 unified
// retrieval integration inside ask-question/index.ts.
//
// Architectural limitation (see Phase 6 report): ask-question/index.ts calls
// `Deno.serve(async (req) => {...})` with the entire request handler as an
// inline, unexported closure. There is no exported function to invoke
// directly, so a real end-to-end test would have to either (a) actually
// start the Edge Function's HTTP server and hit it over the network — which
// requires live Supabase/Gemini credentials and is not a deterministic unit
// test — or (b) change index.ts's structure to expose a testable seam, which
// this phase was explicitly told not to do without reporting first. Given
// that, these tests instead exercise the identical sequence of shared,
// already-independently-tested functions that index.ts's Step 2b/Step 4
// actually call, in the same order, with the same fallback guard — the same
// approach `unified-retrieval-qa-context.test.ts` already established in
// Phase 5.2, extended here with realistic multi-scenario fixtures.
// `qa-prompt-unchanged.test.ts` separately guards that `buildQAPrompt`'s
// literal template text has not changed.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runUnifiedRetrieval } from "./unified-retrieval.ts";
import { selectCandidates } from "./selection.ts";
import { appendStructuredKnowledgeContext, formatStructuredKnowledgeContext } from "./structured-context.ts";
import type { QASource } from "./notebook-types.ts";
import type { RankedCandidate } from "./ranking.ts";
import type { RetrievalCandidateWithEvidence } from "./evidence.ts";

// ---------------------------------------------------------------------------
// Fake Supabase query builder (same shape used by unified-retrieval-evidence.test.ts)
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
  return { from(table: string) { return new FakeQueryBuilder(db[table] ?? []); } };
}

function failingSupabase() {
  return { from(_table: string): never { throw new Error("simulated unified retrieval failure"); } };
}

function emptyDb(): Record<string, Row[]> {
  return {
    knowledge_entities: [], knowledge_branch_entities: [], knowledge_entity_values: [],
    knowledge_entity_value_evidence: [], knowledge_entity_mentions: [],
    knowledge_entity_relationships: [], knowledge_events: [],
  };
}

const PROJECT_ID = "project-1";

// ---------------------------------------------------------------------------
// Exact replica of ask-question/index.ts's Step 2b + Step 4 composition.
// Returns both the final `context` string (what buildQAPrompt would receive)
// and the selected candidates (to assert on internal evidence/selection
// behavior that never reaches the rendered text).
// ---------------------------------------------------------------------------

async function runAskQuestionContextPipeline(
  supabase: any,
  branchId: string | null,
  chunks: QASource[],
): Promise<{ context: string; selected: RankedCandidate<RetrievalCandidateWithEvidence>[] }> {
  const baseContext = chunks
    .map((s, i) => {
      const ref = s.chapterTitle
        ? `[Chapter ${s.chapterNumber}: ${s.chapterTitle}]`
        : s.chapterNumber
          ? `[Chapter ${s.chapterNumber}]`
          : s.page
            ? `[Page ${s.page}]`
            : `[Source ${i + 1}]`;
      return `${ref}\n${s.content}`;
    })
    .join("\n\n---\n\n");

  let selected: RankedCandidate<RetrievalCandidateWithEvidence>[] = [];
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
    selected = selectCandidates(structuredRanked, { maxTotal: 25 });
    structuredKnowledgeBlock = formatStructuredKnowledgeContext(selected);
  } catch {
    selected = [];
    structuredKnowledgeBlock = "";
  }

  return { context: appendStructuredKnowledgeContext(baseContext, structuredKnowledgeBlock), selected };
}

function entityRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "main-david", canonical_name: "David", entity_type: "character", entity_types: null,
    description: null, attributes: {}, structured_fields: {}, layer: "main", branch_id: null,
    review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null,
    project_id: PROJECT_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: a question whose answer is primarily an Entity/Value
// ---------------------------------------------------------------------------

Deno.test("Scenario 1 (Entity/Value): 'What color is David's hair?' — chunk + entity + value both reach context, no fabricated evidence", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-hair", content: "David's black hair caught the torchlight as he entered.",
    chapterNumber: 3, chapterTitle: "The Feast", page: 41, position: 12, versionId: "version-1", score: 4,
  }];
  const db: Record<string, Row[]> = Object.assign(emptyDb(), {
    knowledge_entities: [entityRow()],
    knowledge_entity_values: [{
      id: "value-hair", entity_id: "main-david", branch_id: null, field_path: "hair_color",
      value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: "extraction-9",
    }],
    knowledge_entity_value_evidence: [{
      id: "ev-hair", value_id: "value-hair", chunk_id: "chunk-hair", quote: "black hair",
      position_start: 8, position_end: 18, page_number: 41, raw_extraction_id: "extraction-9",
    }],
  });

  const { context, selected } = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);

  // Existing relevant chunk is still present, unchanged.
  assertEquals(context.includes("David's black hair caught the torchlight as he entered."), true);
  // Correct structured knowledge reaches context.
  assertEquals(context.includes("[Entity] David (character)"), true);
  assertEquals(context.includes(`[Value] hair_color: {"value":"black"}`), true);
  // Evidence remains attached internally (never rendered as a fabricated citation).
  const valueEntry = selected.find((entry) => entry.candidate.kind === "value");
  assertEquals(valueEntry?.candidate.evidenceRecords[0]?.chunkId, "chunk-hair");
  assertEquals(valueEntry?.candidate.evidenceRecords[0]?.startPosition, 8);
  // No fabricated chunk id/position appears in the rendered text itself —
  // internal identifiers like "chunk-hair" or the evidence's position
  // (8/18) never leak into the prompt text; only the real chapter reference does.
  assertEquals(context.includes("chunk-hair"), false);
  assertEquals(context.includes("8"), false);
  assertEquals(context.match(/\[Chapter 3: The Feast\]/g)?.length, 1);
});

// ---------------------------------------------------------------------------
// Scenario 2: a question requiring a Relationship
// ---------------------------------------------------------------------------

Deno.test("Scenario 2 (Relationship): 'How are David and Goliath related?' — relationship reaches context", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-duel", content: "David faced his rival Goliath on the field.",
    chapterNumber: 5, chapterTitle: null, page: 60, position: 20, versionId: "version-1", score: 3,
  }];
  const db = Object.assign(emptyDb(), {
    knowledge_entities: [
      entityRow(),
      entityRow({ id: "main-goliath", canonical_name: "Goliath" }),
    ],
    knowledge_entity_relationships: [{
      id: "rel-rivalry", branch_id: null, source_entity_id: "main-david", target_entity_id: "main-goliath",
      relationship_type: "rival", operation: "add", review_status: "approved",
      document_id: null, version_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
  });

  const { context } = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);

  assertEquals(context.includes("David faced his rival Goliath on the field."), true);
  assertEquals(context.includes("[Relationship] main-david —rival→ main-goliath"), true);
});

// ---------------------------------------------------------------------------
// Scenario 3: a question requiring an Event
// ---------------------------------------------------------------------------

Deno.test("Scenario 3 (Event): 'What happened at the battle?' — event reaches context", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-battle", content: "The armies clashed at dawn near the valley.",
    chapterNumber: 6, chapterTitle: null, page: 71, position: 25, versionId: "version-1", score: 3,
  }];
  const db = Object.assign(emptyDb(), {
    knowledge_events: [{
      id: "event-battle", branch_id: null, name: "The Battle of the Valley",
      description: "The armies clashed at dawn.", attributes: {},
      document_id: null, version_id: null, raw_extraction_id: null, project_id: PROJECT_ID,
    }],
  });

  const { context } = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);

  assertEquals(context.includes("The armies clashed at dawn near the valley."), true);
  assertEquals(context.includes("[Event] The Battle of the Valley: The armies clashed at dawn."), true);
});

// ---------------------------------------------------------------------------
// Scenario 4: Main vs. selected Branch have different effective values
// ---------------------------------------------------------------------------

Deno.test("Scenario 4 (Main vs Branch value): the selected branch's override shows, Main's baseline shows without a branch, wrong branch never leaks", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-hair-2", content: "Some say his hair had changed color since the journey.",
    chapterNumber: 9, chapterTitle: null, page: null, position: 40, versionId: "version-1", score: 2,
  }];
  const db = Object.assign(emptyDb(), {
    knowledge_entities: [entityRow()],
    // A branch overlay row is what makes Phase 1's resolver treat this
    // entity as overridden in branch-1 (see branch-resolution.ts's
    // resolveEffectiveEntities): without it, a branch-scoped value row alone
    // is never picked up, by design — this mirrors the real write path.
    knowledge_branch_entities: [
      { id: "overlay-1", branch_id: "branch-1", source_entity_id: "main-david", entity_id: "main-david", overrides: {}, rejected_fields: [] },
    ],
    knowledge_entity_values: [
      { id: "value-main", entity_id: "main-david", branch_id: null, field_path: "hair_color", value_json: { value: "black" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
      { id: "value-branch-1", entity_id: "main-david", branch_id: "branch-1", field_path: "hair_color", value_json: { value: "grey" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
      { id: "value-branch-2", entity_id: "main-david", branch_id: "branch-2", field_path: "hair_color", value_json: { value: "white" }, source_type: "ai", value_status: "active", raw_extraction_id: null },
    ],
  });

  const mainOnly = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);
  assertEquals(mainOnly.context.includes(`{"value":"black"}`), true);
  assertEquals(mainOnly.context.includes(`{"value":"grey"}`), false);
  assertEquals(mainOnly.context.includes(`{"value":"white"}`), false);

  const branch1 = await runAskQuestionContextPipeline(fakeSupabase(db), "branch-1", chunks);
  assertEquals(branch1.context.includes(`{"value":"grey"}`), true);
  assertEquals(branch1.context.includes(`{"value":"black"}`), false);
  assertEquals(branch1.context.includes(`{"value":"white"}`), false);
});

// ---------------------------------------------------------------------------
// Scenario 5: a Branch-only entity should be visible only in its own branch
// ---------------------------------------------------------------------------

Deno.test("Scenario 5 (Branch-only entity): visible when its branch is selected, absent from Main and from another branch", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-jonathan", content: "In this retelling, Jonathan never leaves the camp.",
    chapterNumber: 2, chapterTitle: null, page: null, position: 5, versionId: "version-1", score: 2,
  }];
  const db = Object.assign(emptyDb(), {
    knowledge_entities: [
      entityRow(),
      { id: "branch-jonathan", canonical_name: "Jonathan", entity_type: "character", entity_types: null, description: null, attributes: {}, structured_fields: {}, layer: "branch", branch_id: "branch-1", review_status: "confirmed", version_id: null, document_id: null, raw_extraction_id: null, project_id: PROJECT_ID },
    ],
  });

  // The chunk itself mentions "Jonathan" in prose regardless of branch (chunks
  // aren't branch-scoped) — so the structured-knowledge line specifically is
  // what must appear only for branch-1, never for Main or another branch.
  const structuredJonathanLine = "[Entity] Jonathan (character)";

  const mainOnly = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);
  assertEquals(mainOnly.context.includes(structuredJonathanLine), false);

  const branch1 = await runAskQuestionContextPipeline(fakeSupabase(db), "branch-1", chunks);
  assertEquals(branch1.context.includes(structuredJonathanLine), true);

  const branch2 = await runAskQuestionContextPipeline(fakeSupabase(db), "branch-2", chunks);
  assertEquals(branch2.context.includes(structuredJonathanLine), false);
});

// ---------------------------------------------------------------------------
// Scenario 6: many structured candidates must not overwhelm the relevant chunks
// ---------------------------------------------------------------------------

Deno.test("Scenario 6 (selection respects the pipeline's cap): chunks stay intact and structured additions are capped at 25, regardless of how many candidates exist", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-relevant", content: "The relevant passage the question is actually about.",
    chapterNumber: 1, chapterTitle: null, page: null, position: 0, versionId: "version-1", score: 9,
  }];
  const manyEntities: Row[] = Array.from({ length: 40 }, (_, i) => entityRow({
    id: `entity-${i}`, canonical_name: `Minor Character ${i}`,
  }));
  const db = Object.assign(emptyDb(), { knowledge_entities: manyEntities });

  const { context, selected } = await runAskQuestionContextPipeline(fakeSupabase(db), null, chunks);

  // The relevant chunk is still fully present, unaffected by how much structured data exists.
  assertEquals(context.includes("The relevant passage the question is actually about."), true);
  // Selection respects the existing selectCandidates(maxTotal: 25) cap — never all 40.
  assertEquals(selected.length, 25);
  assertEquals(context.split("- [Entity]").length - 1, 25);
});

// ---------------------------------------------------------------------------
// Scenario 7: unified retrieval is empty / fails — existing chunk-only behavior remains intact
// ---------------------------------------------------------------------------

Deno.test("Scenario 7a (empty structured retrieval): chunk-only context is identical to the pre-Phase-5 behavior", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-only", content: "Nothing structured is known about this passage yet.",
    chapterNumber: 1, chapterTitle: null, page: null, position: 0, versionId: "version-1", score: 1,
  }];
  const { context, selected } = await runAskQuestionContextPipeline(fakeSupabase(emptyDb()), null, chunks);
  assertEquals(context, "[Chapter 1]\nNothing structured is known about this passage yet.");
  assertEquals(selected, []);
});

Deno.test("Scenario 7b (unified retrieval failure): falls back to the exact old chunk-based context, request never fails", async () => {
  const chunks: QASource[] = [{
    chunkId: "chunk-only", content: "Nothing structured is known about this passage yet.",
    chapterNumber: 1, chapterTitle: null, page: null, position: 0, versionId: "version-1", score: 1,
  }];
  const { context, selected } = await runAskQuestionContextPipeline(failingSupabase(), null, chunks);
  assertEquals(context, "[Chapter 1]\nNothing structured is known about this passage yet.");
  assertEquals(selected, []);
});
