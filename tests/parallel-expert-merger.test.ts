import {
  loadValidatedExpertArtifacts,
  mergeValidatedExpertArtifacts,
  type ValidatedExpertArtifact,
} from "../supabase/functions/_shared/parallel-expert-merger.ts";
import { EXPERT_CONTRACT_VERSION } from "../supabase/functions/_shared/parallel-experts.ts";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";

function artifact(
  id: string,
  role: "characters" | "locations" | "events",
  windowId: string,
  resultOverrides: Record<string, unknown> = {},
): ValidatedExpertArtifact {
  const window = { window_id: windowId, offset: 0, limit: 2, chunk_positions: [0, 1] };
  return {
    id,
    role,
    window,
    model: "test-model",
    usage: { input_tokens: 10, output_tokens: 5, thinking_tokens: 1, cached_tokens: 0, total_tokens: 16 },
    latency_ms: 3,
    parsed_response: {
      contract_version: EXPERT_CONTRACT_VERSION,
      role,
      window,
      entities: [],
      events: [],
      relationships: [],
      unresolved_references: [],
      ...resultOverrides,
    },
  } as ValidatedExpertArtifact;
}

Deno.test("merger deterministically deduplicates candidates and preserves artifact provenance", () => {
  const first = artifact("artifact-1", "characters", "window-1", {
    entities: [{
      name: "Mara",
      entity_type: "character",
      aliases: ["M"],
      fields: { description: "A captain", age: "30" },
      evidence: ["Mara entered."],
      chunk_positions: [0],
      source_references: [{ chunk_position: 0, quote: "Mara entered." }],
      confidence: 0.9,
    }],
  });
  const second = artifact("artifact-2", "characters", "window-2", {
    window: { window_id: "window-2", offset: 2, limit: 2, chunk_positions: [2, 3] },
    entities: [{
      name: "Mara",
      entity_type: "character",
      aliases: ["Captain Mara"],
      fields: { age: "31", gender: "female" },
      evidence: ["Captain Mara waited."],
      chunk_positions: [2],
      source_references: [{ chunk_position: 2, quote: "Captain Mara waited." }],
      confidence: 0.8,
    }],
  });
  first.model = "gemini-3.5-flash";
  second.model = "gemini-3.5-flash-lite";

  const merged = mergeValidatedExpertArtifacts([first, second]);
  const characters = merged.extraction.characters as Array<Record<string, unknown>>;
  const mara = characters[0];
  const attributes = mara.attributes as Record<string, unknown>;
  const metadata = attributes.extraction_meta as Record<string, unknown>;

  assertEquals(characters.length, 1);
  assertEquals(mara.aliases, ["M", "Captain Mara"]);
  assertEquals(mara.chunk_positions, [0, 2]);
  assertEquals((metadata.parallel_expert_artifacts as unknown[]).length, 2);
  assertEquals(merged.artifact_ids, ["artifact-1", "artifact-2"]);
  assertEquals(merged.expert_models, [
    { id: "artifact-1", role: "characters", window_id: "window-1", model: "gemini-3.5-flash" },
    { id: "artifact-2", role: "characters", window_id: "window-2", model: "gemini-3.5-flash-lite" },
  ]);
  assertEquals(merged.extraction.__parallel_expert_artifacts, merged.expert_models);
  assertEquals(merged.usage.total_tokens, 32);
  assert((mara.source_references as Array<Record<string, unknown>>).every((reference) => reference.artifact_id));
});

function clientFor(rows: unknown[], error: Error | null = null) {
  const query = {
    select() { return this; },
    eq() { return this; },
    is() { return this; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(resolve({ data: rows, error }));
    },
  };
  return { from: () => query };
}

function artifactRow(id: string, role: "characters" | "locations" | "events", windowId: string, status = "succeeded") {
  const window = { window_id: windowId, offset: 0, limit: 2, chunk_positions: [0, 1] };
  return {
    id,
    project_id: "project-1",
    document_id: "document-1",
    version_id: "version-1",
    user_id: "user-1",
    extraction_run_id: "run-1",
    branch_id: null,
    model_profile: "sub-base",
    extraction_strategy: "parallel-experts",
    role,
    window_id: windowId,
    offset: window.offset,
    chunk_limit: window.limit,
    chunk_positions: window.chunk_positions,
    status,
    model: "test-model",
    input_tokens: 1,
    output_tokens: 2,
    thinking_tokens: 0,
    cached_tokens: 0,
    total_tokens: 3,
    latency_ms: 4,
    parsed_response: {
      contract_version: EXPERT_CONTRACT_VERSION,
      role,
      window,
      entities: [],
      events: [],
      relationships: [],
      unresolved_references: [],
    },
  };
}

const loadContext = {
  project_id: "project-1",
  document_id: "document-1",
  version_id: "version-1",
  user_id: "user-1",
  extraction_run_id: "run-1",
  branch_id: null,
  model_profile: "sub-base",
  expected_windows: [
    { role: "characters" as const, window: { window_id: "window-1", offset: 0, limit: 2, chunk_positions: [0, 1] } },
  ],
};

Deno.test("artifact loader accepts only matching succeeded rows and validates row/payload provenance", async () => {
  const loaded = await loadValidatedExpertArtifacts(
    clientFor([artifactRow("artifact-1", "characters", "window-1")]),
    loadContext,
  );
  assertEquals(loaded.length, 1);
  assertEquals(loaded[0].id, "artifact-1");
});

Deno.test("artifact loader rejects missing or unfinished expected windows", async () => {
  await assertRejects(
    () => loadValidatedExpertArtifacts(
      clientFor([artifactRow("artifact-1", "characters", "window-1", "running")]),
      loadContext,
    ),
    Error,
    "missing or unfinished",
  );
});

Deno.test("artifact loader rejects inconsistent parsed role and row role", async () => {
  const row = artifactRow("artifact-1", "characters", "window-1");
  (row.parsed_response as Record<string, unknown>).role = "locations";
  await assertRejects(
    () => loadValidatedExpertArtifacts(clientFor([row]), loadContext),
    Error,
    "inconsistent role/window provenance",
  );
});
