import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildSkippedBatchResponse, getExtractionSkipReason } from "./skip-policy.ts";

const safetyFailure = {
  status: 422,
  isRetriable: false,
  fallbackChain: [{ reason: "safety block" }],
};

const transientFailure = {
  status: 503,
  isRetriable: true,
  fallbackChain: [{ reason: "retriable error" }],
};

Deno.test("Safety blocks are skippable only for sub-base-locations", () => {
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, safetyFailure),
    "safety_block",
  );
  assertEquals(getExtractionSkipReason("sub-base", true, safetyFailure), null);
  assertEquals(getExtractionSkipReason("sub-base-2", true, safetyFailure), null);
  assertEquals(getExtractionSkipReason("sub-base-locations", false, safetyFailure), null);
});

Deno.test("Exhausted transient Gemini failures are skippable only when enabled", () => {
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, transientFailure),
    "transient_failure",
  );
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, { ...transientFailure, isRetriable: false }),
    null,
  );
});

Deno.test("Skipped batch advances by chunks read and marks a short final batch done", () => {
  const response = buildSkippedBatchResponse(
    "safety_block",
    [{ position: 8 }, { position: 9 }],
    8,
    3,
  );
  assert(response.success);
  assert(response.skipped);
  assertEquals(response.next_offset, 10);
  assertEquals(response.done, true);
  assertEquals(response.skipped_chunks, [8, 9]);
  assertEquals(response.summary.persisted_items_saved, 0);

  const partial = buildSkippedBatchResponse(
    "transient_failure",
    [{ position: 10 }],
    10,
    3,
  );
  assertEquals(partial.next_offset, 11);
  assertEquals(partial.done, true);
});
