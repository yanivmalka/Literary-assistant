import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildValueWritePlan } from "./value-write-plan.ts";

const observation = (value: string, inferred = false) => ({
  value,
  evidence: [],
  confidence: inferred ? 0.6 : 0.9,
  inferred,
  inference_note: inferred ? "Observed from repeated behavior" : null,
});

Deno.test("user value wins within the active Main or Branch scope", () => {
  const plan = buildValueWritePlan([
    { id: "user-value", source_type: "user", value_status: "active" },
  ], [observation("30")]);
  assertEquals(plan.skip, true);
  assertEquals(plan.writes, []);
});

Deno.test("new AI value supersedes prior AI value while preserving conflict observations", () => {
  const plan = buildValueWritePlan([
    { id: "old-ai", source_type: "ai", value_status: "active" },
  ], [observation("30"), observation("31", true)]);
  assertEquals(plan.skip, false);
  assertEquals(plan.supersede_ids, ["old-ai"]);
  assertEquals(plan.writes.map((write) => write.value_status), ["active", "superseded"]);
  assertEquals(plan.writes[0].supersedes_value_id, "old-ai");
  assertEquals(plan.writes[1].supersedes_value_id, null);
});
