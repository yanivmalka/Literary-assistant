import {
  buildExpertArtifactRecord,
  expertArtifactIdempotencyKey,
  isExpertArtifactStatus,
} from "../supabase/functions/_shared/parallel-expert-artifacts.ts";
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";

const window = {
  window_id: "window-1",
  offset: 0,
  limit: 3,
  chunk_positions: [0, 1, 2],
};

Deno.test("expert artifact key is stable per run, role, and window", () => {
  assertEquals(
    expertArtifactIdempotencyKey("run-1", "characters", "window-1"),
    "run-1:characters:window-1",
  );
  assert(
    expertArtifactIdempotencyKey("run-1", "characters", "window-1") !==
      expertArtifactIdempotencyKey("run-1", "events", "window-1"),
  );
});

Deno.test("artifact record preserves Branch scope and specialist status", () => {
  const record = buildExpertArtifactRecord({
    project_id: "project-1",
    document_id: "document-1",
    version_id: "version-1",
    user_id: "user-1",
    extraction_run_id: "run-1",
    branch_id: "branch-1",
    model_profile: "sub-base",
    role: "locations",
    window,
    status: "succeeded",
    attempt: 1,
    model: "gemini-3.5-flash",
    raw_response: { locations: [] },
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      thinking_tokens: 0,
      cached_tokens: 50,
      total_tokens: 120,
    },
    latency_ms: 250,
  });

  assertEquals(record.extraction_strategy, "parallel-experts");
  assertEquals(record.branch_id, "branch-1");
  assertEquals(record.status, "succeeded");
  assertEquals(record.total_tokens, 120);
  assertEquals(record.chunk_positions, [0, 1, 2]);
});

Deno.test("artifact records reject invalid lifecycle state and attempts", () => {
  assert(isExpertArtifactStatus("pending"));
  assert(!isExpertArtifactStatus("completed"));
  assertThrows(() => buildExpertArtifactRecord({
    project_id: "project-1",
    document_id: "document-1",
    version_id: "version-1",
    user_id: "user-1",
    extraction_run_id: "run-1",
    branch_id: null,
    model_profile: "sub-base",
    role: "events",
    window,
    status: "pending",
    attempt: -1,
  }));
});
