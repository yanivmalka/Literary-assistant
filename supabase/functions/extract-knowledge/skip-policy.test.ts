import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSkippedBatchResponse,
  getExtractionSkipReason,
  getUnusableResponseSkip,
  isSkipPerBatchAllowed,
  SKIP_ELIGIBLE_PROFILES,
} from "./skip-policy.ts";

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

Deno.test("Safety blocks are skippable only for skip-eligible profiles", () => {
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, safetyFailure),
    "safety_block",
  );
  assertEquals(
    getExtractionSkipReason("sub-base-c-characters", true, safetyFailure),
    "safety_block",
  );
  assertEquals(getExtractionSkipReason("sub-base", true, safetyFailure), null);
  assertEquals(getExtractionSkipReason("sub-base-2", true, safetyFailure), null);
  assertEquals(getExtractionSkipReason("sub-base-locations", false, safetyFailure), null);
  assertEquals(getExtractionSkipReason("sub-base-c-characters", false, safetyFailure), null);
});

Deno.test("Exhausted transient Gemini failures are skippable only when enabled", () => {
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, transientFailure),
    "transient_failure",
  );
  assertEquals(
    getExtractionSkipReason("sub-base-c-characters", true, transientFailure),
    "transient_failure",
  );
  assertEquals(
    getExtractionSkipReason("sub-base-locations", true, { ...transientFailure, isRetriable: false }),
    null,
  );
  assertEquals(
    getExtractionSkipReason("sub-base-c-characters", true, { ...transientFailure, isRetriable: false }),
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

// ============================================================
// Phase 2 A1: Sub-base C is actually wired into the skip path
// (the Edge request gate now uses isSkipPerBatchAllowed / SKIP_ELIGIBLE_PROFILES)
// ============================================================

Deno.test("A1: the request gate accepts skip_per_batch for skip-eligible profiles only", () => {
  assert(isSkipPerBatchAllowed("sub-base-locations"));
  assert(isSkipPerBatchAllowed("sub-base-c-characters"));
  assert(!isSkipPerBatchAllowed("sub-base"));
  assert(!isSkipPerBatchAllowed("sub-base-2"));
  // The gate helper and the set must agree.
  for (const profile of ["sub-base", "sub-base-2", "sub-base-locations", "sub-base-c-characters"]) {
    assertEquals(isSkipPerBatchAllowed(profile), SKIP_ELIGIBLE_PROFILES.has(profile));
  }
});

Deno.test("A1: a Sub-base C request with skip_per_batch reaches the skip-and-continue path end to end", () => {
  const modelProfile = "sub-base-c-characters";
  const skipPerBatch = true;

  // 1. Request gate: not rejected.
  assert(isSkipPerBatchAllowed(modelProfile));

  // 2. Classified Gemini failure resolves to a skip reason instead of aborting.
  assertEquals(getExtractionSkipReason(modelProfile, skipPerBatch, safetyFailure), "safety_block");
  assertEquals(getExtractionSkipReason(modelProfile, skipPerBatch, transientFailure), "transient_failure");

  // 3. The skip response advances the batch cursor rather than failing the run.
  const response = buildSkippedBatchResponse("safety_block", [{ position: 4 }, { position: 5 }], 4, 8);
  assert(response.success);
  assert(response.skipped);
  assertEquals(response.next_offset, 6);
});

Deno.test("A1: profiles that are not skip-eligible keep aborting (skip_per_batch has no effect)", () => {
  for (const profile of ["sub-base", "sub-base-2"]) {
    assert(!isSkipPerBatchAllowed(profile));
    assertEquals(getExtractionSkipReason(profile, true, safetyFailure), null);
    assertEquals(getExtractionSkipReason(profile, true, transientFailure), null);
  }
});

// ============================================================
// Issue 11 (Phase 5): post-response failures (empty / unparseable /
// schema-mismatch / invalid payload) isolate to the current window for
// skip-eligible profiles with skip_per_batch, instead of failing the run.
// ============================================================

Deno.test("Issue 11: getUnusableResponseSkip isolates the window only for skip-eligible profiles with skip_per_batch", () => {
  assertEquals(getUnusableResponseSkip("sub-base-c-characters", true), "unusable_response");
  assertEquals(getUnusableResponseSkip("sub-base-locations", true), "unusable_response");

  // opt-in flag off -> not skippable
  assertEquals(getUnusableResponseSkip("sub-base-c-characters", false), null);

  // not skip-eligible -> never skippable, flag or no flag
  assertEquals(getUnusableResponseSkip("sub-base-2", true), null);
  assertEquals(getUnusableResponseSkip("sub-base", true), null);
  assertEquals(getUnusableResponseSkip("totally-unknown", true), null);
});

Deno.test("Issue 11: an unusable-response skip response reports zeros and advances the offset like any skipped window", () => {
  const chunks = [{ position: 4 }, { position: 5 }];
  const response = buildSkippedBatchResponse("unusable_response", chunks, 4, 10);
  assertEquals(response.skipped, true);
  assertEquals(response.skip_reason, "unusable_response");
  assertEquals(response.skipped_chunks, [4, 5]);
  assertEquals(response.next_offset, 6);
  assertEquals(response.done, true); // 2 chunks < limit 10 -> final window
  assertEquals(response.summary.entities_saved, 0);
  assertEquals(response.summary.chunks_skipped, 2);
});

Deno.test("Issue 11: an isolated middle-batch model failure is skipped while a genuinely fatal failure still aborts", () => {
  const profile = "sub-base-c-characters";

  // Batch 1 -> success: no failure object, nothing to classify.
  // Batch 2 -> model failure (retriable / exhausted fallback). It must resolve
  // to a skip so the run keeps going, NOT an extraction-wide abort.
  const batch2Reason = getExtractionSkipReason(profile, true, transientFailure)
    ?? getUnusableResponseSkip(profile, true);
  assertEquals(batch2Reason, "transient_failure");
  const batch2Response = buildSkippedBatchResponse(batch2Reason!, [{ position: 2 }, { position: 3 }], 2, 2);
  assert(batch2Response.success);
  assert(batch2Response.skipped);
  assertEquals(batch2Response.summary.entities_saved, 0);
  assertEquals(batch2Response.next_offset, 4); // Batch 3 resumes here.

  // Batch 3 -> success: unaffected by Batch 2's skip.

  // A genuinely fatal condition (non-retriable, non-safety) is never skipped —
  // the caller still returns an error and fails the extraction.
  const fatal = { status: 400, isRetriable: false, fallbackChain: [{ reason: "bad request" }] };
  assertEquals(getExtractionSkipReason(profile, true, fatal), null);
});

Deno.test("Issue 11: the transport-failure classifier is unchanged by the new post-response path", () => {
  // getExtractionSkipReason still only skips retriable/safety transport failures.
  assertEquals(getExtractionSkipReason("sub-base-c-characters", true, transientFailure), "transient_failure");
  assertEquals(getExtractionSkipReason("sub-base-c-characters", true, safetyFailure), "safety_block");
  assertEquals(
    getExtractionSkipReason("sub-base-c-characters", true, { status: 400, isRetriable: false, fallbackChain: [] }),
    null,
  );
});
