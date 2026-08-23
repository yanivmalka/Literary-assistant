import {
  DEFAULT_EXPERT_TOKEN_BUDGET,
  EXPERT_CONTRACT_VERSION,
  consumeTokenBudget,
  createTokenBudgetState,
  validateExpertExtractionResult,
} from "../supabase/functions/_shared/parallel-experts.ts";
import {
  isParallelExpertsRolloutEnabled,
  validateExtractionStrategyRollout,
} from "../supabase/functions/extract-knowledge/testable-pipeline.ts";
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

function validResult() {
  return {
    contract_version: EXPERT_CONTRACT_VERSION,
    role: "characters",
    window: {
      window_id: "window-1",
      offset: 0,
      limit: 3,
      chunk_positions: [0, 1, 2],
    },
    entities: [{
      name: "Leo",
      entity_type: "character",
      aliases: ["Leon"],
      fields: { age: "25" },
      evidence: ["Leo entered the room."],
      chunk_positions: [0],
      source_references: [{ chunk_position: 0, quote: "Leo entered the room." }],
      confidence: 0.9,
    }],
    events: [],
    relationships: [],
    unresolved_references: [],
  };
}

Deno.test("parallel expert contract accepts a complete specialist result", () => {
  const validation = validateExpertExtractionResult(validResult());
  assert(validation.valid);
  if (validation.valid) assertEquals(validation.value.role, "characters");
});

Deno.test("parallel expert contract rejects missing provenance and malformed candidates", () => {
  const value = validResult() as Record<string, unknown>;
  const entities = value.entities as Array<Record<string, unknown>>;
  delete entities[0].source_references;

  const validation = validateExpertExtractionResult(value);
  assert(!validation.valid);
  if (!validation.valid) assert(validation.errors.includes("entities contains an invalid candidate"));
});

Deno.test("token budget accounts for each lane independently and rejects overflow", () => {
  const initial = createTokenBudgetState();
  assertEquals(initial.limit, DEFAULT_EXPERT_TOKEN_BUDGET);

  const first = consumeTokenBudget(initial, {
    input_tokens: 90_000,
    output_tokens: 5_000,
    thinking_tokens: 0,
    cached_tokens: 0,
    total_tokens: 95_000,
  });
  assert(first.ok);
  if (!first.ok) return;
  assertEquals(first.remaining, 55_000);

  const overflow = consumeTokenBudget(first.state, {
    input_tokens: 60_000,
    output_tokens: 0,
    thinking_tokens: 0,
    cached_tokens: 0,
    total_tokens: 60_000,
  });
  assert(!overflow.ok);
  if (!overflow.ok) assertEquals(overflow.reason, "budget-exceeded");
});

Deno.test("token budget falls back to component counts when total is invalid", () => {
  const result = consumeTokenBudget(createTokenBudgetState(100), {
    input_tokens: 30,
    output_tokens: 20,
    thinking_tokens: 10,
    cached_tokens: 0,
    total_tokens: Number.NaN,
  });

  assert(result.ok);
  if (result.ok) assertEquals(result.state.consumed, 60);
});

Deno.test("parallel-experts rollout is fail-closed and exact-true only", () => {
  assertEquals(isParallelExpertsRolloutEnabled(undefined), false);
  assertEquals(isParallelExpertsRolloutEnabled("TRUE"), false);
  assertEquals(isParallelExpertsRolloutEnabled("true"), true);
  assertEquals(validateExtractionStrategyRollout("legacy-sequential", false), { ok: true });
  const disabled = validateExtractionStrategyRollout("parallel-experts", false);
  assert(!disabled.ok);
  if (!disabled.ok) assert(disabled.error.includes("EXTRACTION_PARALLEL_EXPERTS_ENABLED=true"));
  assertEquals(validateExtractionStrategyRollout("parallel-experts", true), { ok: true });
});
