// Regression tests for the AND-then-OR fallback added to legacyHybridSearch
// and enhancedHybridSearch (supabase/functions/ask-question/index.ts).
//
// index.ts calls Deno.serve(...) at module scope, so importing it directly
// would start a real HTTP listener (see qa-prompt-unchanged.test.ts, which
// works around the same constraint with a golden-string check instead). Here
// we need the actual functions, so Deno.serve is stubbed to a no-op before
// the dynamic import and restored immediately after; the real request
// handler passed to it is never invoked by these tests.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// deno-lint-ignore no-explicit-any
const originalServe = (Deno as any).serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: async () => {} });

const { legacyHybridSearch, enhancedHybridSearch } = await import("./index.ts");

// deno-lint-ignore no-explicit-any
(Deno as any).serve = originalServe;

interface ChunkRow {
  id: string;
  content: string;
  chapter_number: number | null;
  chapter_title: string | null;
  page: number | null;
  position: number;
  version_id: string;
}

interface ChunkResponse {
  data: ChunkRow[] | null;
  error: { message: string } | null;
}

interface RecordedChunkCall {
  textSearch?: { col: string; query: string; opts: unknown };
  ilike?: { col: string; pattern: string };
}

/**
 * A minimal fake Supabase client covering only the chain shapes that
 * legacyHybridSearch/enhancedHybridSearch actually call: `documents` and
 * `document_versions` always resolve to fixed rows; `document_chunks`
 * resolves to the next entry in `chunkResponses` on each successive call,
 * mirroring the real sequential primary -> OR-fallback -> ilike-fallback
 * query flow.
 */
function makeSupabaseMock(options: {
  documents: { id: string }[];
  versions: { id: string; status?: string }[];
  chunkResponses: ChunkResponse[];
}) {
  let chunkCallIndex = 0;
  const chunkCalls: RecordedChunkCall[] = [];

  // deno-lint-ignore no-explicit-any
  function chain(resultProvider: () => unknown, onLimit?: (state: Record<string, unknown>) => void): any {
    const state: Record<string, unknown> = {};
    // deno-lint-ignore no-explicit-any
    const builder: any = {
      select(fields: unknown) {
        state.select = fields;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.eq = [col, val];
        return builder;
      },
      in(col: string, vals: unknown) {
        state[`in_${col}`] = vals;
        return builder;
      },
      gte(col: string, val: unknown) {
        state[`gte_${col}`] = val;
        return builder;
      },
      lte(col: string, val: unknown) {
        state[`lte_${col}`] = val;
        return builder;
      },
      textSearch(col: string, query: string, opts: unknown) {
        state.textSearch = { col, query, opts };
        return builder;
      },
      ilike(col: string, pattern: string) {
        state.ilike = { col, pattern };
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        onLimit?.(state);
        return builder;
      },
      // deno-lint-ignore no-explicit-any
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(resultProvider()).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "documents") {
        return chain(() => ({ data: options.documents, error: null }));
      }
      if (table === "document_versions") {
        return chain(() => ({ data: options.versions, error: null }));
      }
      if (table === "document_chunks") {
        return chain(
          () => {
            const response = options.chunkResponses[chunkCallIndex] ?? { data: [], error: null };
            chunkCallIndex += 1;
            return response;
          },
          (state) => {
            chunkCalls.push({
              textSearch: state.textSearch as RecordedChunkCall["textSearch"],
              ilike: state.ilike as RecordedChunkCall["ilike"],
            });
          },
        );
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
    getChunkCallCount: () => chunkCallIndex,
    getChunkCalls: () => chunkCalls,
  };
}

const DOCS = [{ id: "doc-1" }];
const VERSIONS = [{ id: "version-1", status: "ready" }];

const SAMPLE_CHUNK: ChunkRow = {
  id: "chunk-1",
  content: "מירה ביקשה ממנו להפסיק",
  chapter_number: 1,
  chapter_title: null,
  page: null,
  position: 0,
  version_id: "version-1",
};

// ---------------------------------------------------------------------------
// legacyHybridSearch
// ---------------------------------------------------------------------------

Deno.test("legacyHybridSearch: successful AND search does not trigger the OR fallback", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [{ data: [SAMPLE_CHUNK], error: null }],
  });

  const sources = await legacyHybridSearch(supabase, "project-1", "מירה", 5, null);

  assertEquals(supabase.getChunkCallCount(), 1);
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
  assertEquals(supabase.getChunkCalls()[0].textSearch?.opts, { type: "plain", config: "simple" });
});

Deno.test("legacyHybridSearch: zero-row AND search triggers the OR fallback and retrieves the expected chunk", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [
      { data: [], error: null }, // primary AND query: "מי"/"זה"/"מירה" never co-occur
      { data: [SAMPLE_CHUNK], error: null }, // OR fallback matches on "מירה" alone
    ],
  });

  const sources = await legacyHybridSearch(supabase, "project-1", "מי זה מירה?", 5, null);

  assertEquals(supabase.getChunkCallCount(), 2);
  const calls = supabase.getChunkCalls();
  assertEquals(calls[0].textSearch?.opts, { type: "plain", config: "simple" });
  // The OR fallback must NOT use type: "plain" (plainto_tsquery ignores
  // operators and always ANDs regardless of how terms are joined).
  assertEquals(calls[1].textSearch?.opts, { config: "simple" });
  assertEquals((calls[1].textSearch?.opts as { type?: string })?.type, undefined);
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
});

Deno.test("legacyHybridSearch: a textSearch error still reaches the existing ilike fallback (OR path is skipped)", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [
      { data: null, error: { message: "simulated tsquery failure" } },
      { data: [SAMPLE_CHUNK], error: null },
    ],
  });

  const sources = await legacyHybridSearch(supabase, "project-1", "מי זה מירה?", 5, null);

  assertEquals(supabase.getChunkCallCount(), 2);
  const calls = supabase.getChunkCalls();
  assertEquals(calls[0].textSearch !== undefined, true);
  assertEquals(calls[1].ilike !== undefined, true);
  assertEquals(calls[1].textSearch, undefined);
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
});

// ---------------------------------------------------------------------------
// enhancedHybridSearch
// ---------------------------------------------------------------------------

Deno.test("enhancedHybridSearch: successful AND search does not trigger the OR fallback", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [{ data: [SAMPLE_CHUNK], error: null }],
  });

  const sources = await enhancedHybridSearch(supabase, "project-1", "מירה", 5, { includeAdjacent: false });

  assertEquals(supabase.getChunkCallCount(), 1);
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
});

Deno.test("enhancedHybridSearch: zero-row AND search triggers the OR fallback and retrieves the expected chunk", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [
      { data: [], error: null },
      { data: [SAMPLE_CHUNK], error: null },
    ],
  });

  const sources = await enhancedHybridSearch(supabase, "project-1", "מי זה מירה?", 5, { includeAdjacent: false });

  assertEquals(supabase.getChunkCallCount(), 2);
  const calls = supabase.getChunkCalls();
  assertEquals(calls[1].textSearch?.opts, { config: "simple" });
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
});

Deno.test("enhancedHybridSearch: a textSearch error still reaches the existing ilike fallback", async () => {
  const supabase = makeSupabaseMock({
    documents: DOCS,
    versions: VERSIONS,
    chunkResponses: [
      { data: null, error: { message: "simulated tsquery failure" } },
      { data: [SAMPLE_CHUNK], error: null },
    ],
  });

  const sources = await enhancedHybridSearch(supabase, "project-1", "מי זה מירה?", 5, { includeAdjacent: false });

  assertEquals(supabase.getChunkCallCount(), 2);
  const calls = supabase.getChunkCalls();
  assertEquals(calls[1].ilike !== undefined, true);
  assertEquals(calls[1].textSearch, undefined);
  assertEquals(sources.length, 1);
  assertEquals(sources[0].chunkId, "chunk-1");
});
