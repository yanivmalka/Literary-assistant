export type ExtractionSkipReason = "safety_block" | "transient_failure";

interface GeminiFailureLike {
  status: number;
  isRetriable: boolean;
  fallbackChain?: Array<{ reason?: string }>;
}

export function getExtractionSkipReason(
  modelProfile: string,
  skipPerBatch: boolean,
  failure: GeminiFailureLike,
): ExtractionSkipReason | null {
  if (modelProfile !== "sub-base-locations" || !skipPerBatch) return null;

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
