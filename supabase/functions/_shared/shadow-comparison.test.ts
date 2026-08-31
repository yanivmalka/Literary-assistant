import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildShadowComparisonRecord,
  compareShadowPayloads,
  fingerprintShadowInput,
  validateBaselineScope,
  validateShadowCandidatePayload,
} from "./shadow-comparison.ts";

const scope = {
  project_id: "project-1",
  document_id: "document-1",
  version_id: "version-1",
  user_id: "user-1",
};

const baseline = {
  id: "raw-1",
  ...scope,
  branch_id: null,
  model: "gemini-3.5-flash",
  model_profile: "legacy-default",
  extraction_strategy: "legacy-sequential",
  raw_response: {
    characters: [{ name: "Leah", type: "character", attributes: { age: "30", eye_color: "blue" } }],
    relationships: [],
  },
};

Deno.test("baseline scope requires explicit matching lineage", () => {
  assertEquals(validateBaselineScope(baseline, {
    ...scope,
    baseline_raw_extraction_id: "raw-1",
  }), { ok: true });
  const mismatch = validateBaselineScope({ ...baseline, version_id: "other-version" }, {
    ...scope,
    baseline_raw_extraction_id: "raw-1",
  });
  assert(!mismatch.ok);
});

Deno.test("shadow input fingerprint is stable regardless of chunk order", async () => {
  const first = await fingerprintShadowInput([
    { position: 2, content: "second" },
    { position: 1, content: "first" },
  ]);
  const second = await fingerprintShadowInput([
    { position: 1, content: "first" },
    { position: 2, content: "second" },
  ]);
  assertEquals(first, second);
  assert(first.startsWith("sha256:"));
});

Deno.test("candidate payload is isolated to characters and relationships", () => {
  assertEquals(validateShadowCandidatePayload({
    characters: [{ name: "Leah", type: "character" }],
    relationships: [],
  }), { ok: true });
  assert(!validateShadowCandidatePayload({
    characters: [{ name: "Leah" }],
    locations: [{ name: "City" }],
    relationships: [],
  }).ok);
});

Deno.test("comparison reports entity, relationship, and field differences", () => {
  const metrics = compareShadowPayloads(
    baseline.raw_response,
    {
      characters: [
        { name: "Leah", type: "character", attributes: { age: "31", eye_color: "blue" } },
        { name: "Mika", type: "character", attributes: { age: "20" } },
      ],
      relationships: [{ character_a: "Leah", character_b: "Mika", relationship_type: "friendship" }],
    },
  );
  assertEquals(metrics.matched_entity_count, 1);
  assertEquals(metrics.added_entity_count, 1);
  assertEquals(metrics.removed_entity_count, 0);
  assertEquals(metrics.changed_field_count, 1);
  assertEquals(metrics.added_relationship_count, 1);
});

Deno.test("comparison record is idempotent and preserves explicit baseline", () => {
  const record = buildShadowComparisonRecord({
    scope,
    shadow_run_id: "shadow:12345678",
    baseline,
    candidate_payload: { characters: [{ name: "Leah", type: "character" }], relationships: [] },
    offset: 3,
    limit: 3,
    chunk_positions: [3, 4, 5],
    input_fingerprint: "sha256:test",
    candidate_model: "gemini-3.5-flash-lite",
    candidate_primary_model: "gemini-3.5-flash-lite",
  });
  assertEquals(record.comparison_key, "shadow:12345678:raw-1:3:3");
  assertEquals(record.baseline_raw_extraction_id, "raw-1");
  assertEquals(record.input_alignment, "unverified");
});
