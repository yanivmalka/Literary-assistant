export type ExtractionSkipReason = "safety_block" | "transient_failure";

interface GeminiFailureLike {
  status: number;
  isRetriable: boolean;
  fallbackChain?: Array<{ reason?: string }>;
}

/**
 * Profiles that honor the opt-in per-batch skip behavior. Both run one serial
 * extraction call per chunk window, so a single safety-blocked or transiently
 * failing window should be skipped rather than failing the whole document.
 */
export const SKIP_ELIGIBLE_PROFILES = new Set<string>([
  "sub-base-locations",
  "sub-base-c-characters",
]);

/**
 * Whether a request may set `skip_per_batch: true` for this profile. Used by the
 * Edge Function's request gate; other profiles keep rejecting the flag.
 */
export function isSkipPerBatchAllowed(modelProfile: string): boolean {
  return SKIP_ELIGIBLE_PROFILES.has(modelProfile);
}

export function getExtractionSkipReason(
  modelProfile: string,
  skipPerBatch: boolean,
  failure: GeminiFailureLike,
): ExtractionSkipReason | null {
  if (!SKIP_ELIGIBLE_PROFILES.has(modelProfile) || !skipPerBatch) return null;

  const isSafetyBlock = failure.status === 422
    && failure.fallbackChain?.some((attempt) => attempt.reason === "safety block");
  if (isSafetyBlock) return "safety_block";

  if (failure.isRetriable) return "transient_failure";
  return null;
}

export function buildSkippedBatchResponse(
  reason: ExtractionSkipReason,
  chunks: Array<{ position: number }>,
  offset: number,
  limit: number,
) {
  const nextOffset = offset + chunks.length;
  return {
    success: true,
    skipped: true,
    skip_reason: reason,
    skipped_chunks: chunks.map((chunk) => chunk.position),
    done: chunks.length < limit,
    next_offset: nextOffset,
    summary: {
      entities_saved: 0,
      mentions_saved: 0,
      aliases_saved: 0,
      relationships_saved: 0,
      ability_relationships_saved: 0,
      events_saved: 0,
      persisted_items_saved: 0,
      chunks_skipped: chunks.length,
    },
  };
}
