import {
  buildExpertPrompt,
  createGeminiExpertInvoker,
  normalizeGeminiTokenUsage,
  PARALLEL_EXPERT_MODEL_ASSIGNMENTS,
  runParallelExpertJobs,
  type ExpertArtifactContext,
  type ExpertInvocationResult,
  type ExpertJob,
  type ExpertJobResult,
} from "../supabase/functions/_shared/parallel-expert-runner.ts";
import { EXPERT_CONTRACT_VERSION } from "../supabase/functions/_shared/parallel-experts.ts";
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const context: ExpertArtifactContext = {
  project_id: "project-1",
  document_id: "document-1",
  version_id: "version-1",
  user_id: "user-1",
  extraction_run_id: "run-1",
  branch_id: "branch-1",
};

Deno.test("parallel experts assign distinct primary models by specialist role", () => {
  const primaryModels = [
    PARALLEL_EXPERT_MODEL_ASSIGNMENTS.characters[0].id,
    PARALLEL_EXPERT_MODEL_ASSIGNMENTS.locations[0].id,
    PARALLEL_EXPERT_MODEL_ASSIGNMENTS.events[0].id,
  ];

  assertEquals(primaryModels, [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
  ]);
  assertEquals(new Set(primaryModels).size, 3);
  assertEquals(PARALLEL_EXPERT_MODEL_ASSIGNMENTS.characters.length, 3);
  assertEquals(PARALLEL_EXPERT_MODEL_ASSIGNMENTS.locations.length, 3);
  assertEquals(PARALLEL_EXPERT_MODEL_ASSIGNMENTS.events.length, 3);
});

Deno.test("Gemini invoker propagates the model chain selected for each role", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{}" }] } }],
      usageMetadata: { totalTokenCount: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const invoker = createGeminiExpertInvoker({
      api_key: "test-key",
      models_by_role: {
        characters: [PARALLEL_EXPERT_MODEL_ASSIGNMENTS.characters[0]],
        locations: [PARALLEL_EXPERT_MODEL_ASSIGNMENTS.locations[0]],
        events: [PARALLEL_EXPERT_MODEL_ASSIGNMENTS.events[0]],
      },
    });

    for (const role of ["characters", "locations", "events"] as const) {
      await invoker(makeJob(role, `${role}-model`), "{}");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(calls.map((url) => url.split("/").pop()?.split(":")[0]), [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
  ]);
});

function makeJob(role: ExpertJob["role"], windowId: string, offset = 0): ExpertJob {
  return {
    role,
    window: {
      window_id: windowId,
      offset,
      limit: 1,
      chunk_positions: [offset],
    },
    chunks: [{ position: offset, content: `Text for ${windowId}` }],
    model_profile: "sub-base",
  };
}

function validResponse(job: ExpertJob, totalTokens = 1): ExpertInvocationResult {
  return {
    model: "test-model",
    raw_response: { ok: true },
    response_text: JSON.stringify({
      contract_version: EXPERT_CONTRACT_VERSION,
      role: job.role,
      window: job.window,
      entities: [],
      events: [],
      relationships: [],
      unresolved_references: [],
    }),
    usage: {
      input_tokens: totalTokens,
      output_tokens: 0,
      thinking_tokens: 0,
      cached_tokens: 0,
      total_tokens: totalTokens,
    },
    latency_ms: 1,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

Deno.test("runner bounds role concurrency and serializes windows within one role", async () => {
  const jobs = [
    makeJob("characters", "characters-1", 0),
    makeJob("characters", "characters-2", 1),
    makeJob("locations", "locations-1", 2),
    makeJob("locations", "locations-2", 3),
    makeJob("events", "events-1", 4),
  ];
  let active = 0;
  let maxActive = 0;
  const activeByRole = new Map<string, number>();
  const maxByRole = new Map<string, number>();
  const started: string[] = [];

  const results = await runParallelExpertJobs(jobs, async (job) => {
    active++;
    maxActive = Math.max(maxActive, active);
    const roleActive = (activeByRole.get(job.role) ?? 0) + 1;
    activeByRole.set(job.role, roleActive);
    maxByRole.set(job.role, Math.max(maxByRole.get(job.role) ?? 0, roleActive));
    started.push(job.window.window_id);
    await delay(8);
    active--;
    activeByRole.set(job.role, roleActive - 1);
    return validResponse(job);
  }, { max_concurrent_roles: 2 });

  assertEquals(results.every((result) => result.status === "succeeded"), true);
  assert(maxActive <= 2);
  assertEquals(maxByRole.get("characters"), 1);
  assertEquals(maxByRole.get("locations"), 1);
  assert(started.indexOf("characters-1") < started.indexOf("characters-2"));
  assert(started.indexOf("locations-1") < started.indexOf("locations-2"));
});

Deno.test("runner enforces per-role token budget and does not accept overflow", async () => {
  const jobs = [makeJob("events", "events-1"), makeJob("events", "events-2", 1), makeJob("events", "events-3", 2)];
  let invocations = 0;
  const results = await runParallelExpertJobs(
    jobs,
    async (job) => {
      invocations++;
      return validResponse(job, 6);
    },
    { token_budget_per_role: 10 },
  );

  assertEquals(results.map((result) => result.status), ["succeeded", "failed", "failed"]);
  assertEquals(invocations, 2);
  assert(results[1].error?.includes("Token budget exceeded") === true);
  assert(results[2].error?.includes("Token budget exhausted") === true);
});

Deno.test("runner rejects invalid specialist JSON without writing a successful artifact", async () => {
  const persisted: Array<{ status: string; parsed: unknown; error: string | null }> = [];
  const result = await runParallelExpertJobs(
    [makeJob("characters", "characters-invalid")],
    async () => ({
      model: "test-model",
      raw_response: { malformed: true },
      response_text: "not json",
      usage: { input_tokens: 2, output_tokens: 1, thinking_tokens: 0, cached_tokens: 0, total_tokens: 3 },
      latency_ms: 2,
    }),
    {
      persist_artifact: async (artifact) => {
        persisted.push({ status: artifact.status, parsed: artifact.parsed_response, error: artifact.error_message ?? null });
      },
    },
    context,
  );

  assertEquals(result[0].status, "failed");
  assertEquals(persisted.map((artifact) => artifact.status), ["running", "failed"]);
  assertEquals(persisted[1].parsed, null);
  assert(persisted[1].error?.includes("Invalid expert result") === true);
});

Deno.test("runner applies per-role rate spacing and persists success lifecycle", async () => {
  const starts: number[] = [];
  const persisted: Array<{ status: string; extraction_run_id: string; role: string; window_id: string }> = [];
  const results: ExpertJobResult[] = await runParallelExpertJobs(
    [makeJob("locations", "locations-1"), makeJob("locations", "locations-2", 1)],
    async (job) => {
      starts.push(Date.now());
      return validResponse(job);
    },
    {
      min_interval_ms_per_role: 20,
      persist_artifact: async (artifact) => {
        persisted.push({
          status: artifact.status,
          extraction_run_id: artifact.extraction_run_id,
          role: artifact.role,
          window_id: artifact.window.window_id,
        });
      },
    },
    context,
  );

  assertEquals(results.map((result) => result.status), ["succeeded", "succeeded"]);
  assert(starts[1] - starts[0] >= 15);
  assertEquals(persisted.map((artifact) => artifact.status), ["running", "succeeded", "running", "succeeded"]);
  assert(persisted.every((artifact) => artifact.extraction_run_id === "run-1"));
  assert(persisted.every((artifact) => artifact.role === "locations"));
});

Deno.test("runner marks an invocation timeout as failed", async () => {
  const result = await runParallelExpertJobs(
    [makeJob("events", "events-timeout")],
    async () => {
      await delay(20);
      return validResponse(makeJob("events", "unused"));
    },
    { timeout_ms: 5 },
  );

  assertEquals(result[0].status, "failed");
  assert(result[0].error?.includes("timed out") === true);
});

Deno.test("Gemini usage metadata is normalized for lane accounting", () => {
  assertEquals(
    normalizeGeminiTokenUsage({
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 30,
        thoughtsTokenCount: 20,
        cachedContentTokenCount: 10,
        totalTokenCount: 150,
      },
    }),
    {
      input_tokens: 100,
      output_tokens: 30,
      thinking_tokens: 20,
      cached_tokens: 10,
      total_tokens: 150,
    },
  );
});

Deno.test("expert prompt contains source chunks, role, and provenance contract", () => {
  const prompt = buildExpertPrompt(makeJob("characters", "characters-prompt"));
  assert(prompt.includes("characters specialist"));
  assert(prompt.includes("Text for characters-prompt"));
  assert(prompt.includes("source_references"));
});
