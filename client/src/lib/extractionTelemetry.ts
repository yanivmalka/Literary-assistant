export interface ExtractionBatchTelemetry {
  extraction_strategy: 'legacy-sequential' | 'parallel-experts'
  chunks_sent: number
  total_chars: number
  extracted_item_count: number
  persisted_item_count: number
  input_tokens: number | null
  output_tokens: number | null
  thinking_tokens: number | null
  total_tokens: number | null
  cached_tokens: number | null
  latency_ms: number | null
  chunk_fetch_latency_ms: number | null
  prompt_build_latency_ms: number | null
  persistence_latency_ms: number | null
  pipeline_latency_ms: number | null
  total_latency_ms: number | null
}

export interface ExtractionRunTelemetry {
  extraction_strategy: ExtractionBatchTelemetry['extraction_strategy']
  batch_count: number
  chunks_sent: number
  total_chars: number
  extracted_item_count: number
  persisted_item_count: number
  input_tokens: number
  output_tokens: number
  thinking_tokens: number
  total_tokens: number
  cached_tokens: number
  provider_latency_ms: number
  chunk_fetch_latency_ms: number
  prompt_build_latency_ms: number
  persistence_latency_ms: number
  pipeline_latency_ms: number
  total_latency_ms: number
}

export interface ExtractionTelemetryComparison {
  baseline_strategy: ExtractionRunTelemetry['extraction_strategy']
  candidate_strategy: ExtractionRunTelemetry['extraction_strategy']
  same_input: boolean
  chunks_delta: number
  chars_delta: number
  extracted_items_delta: number
  persisted_items_delta: number
  total_tokens_delta: number
  provider_latency_delta_ms: number
  pipeline_latency_delta_ms: number
  total_latency_delta_ms: number
}

function numeric(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function aggregateExtractionTelemetry(
  batches: readonly ExtractionBatchTelemetry[],
): ExtractionRunTelemetry {
  if (batches.length === 0) throw new Error('Cannot aggregate empty extraction telemetry')
  const strategy = batches[0].extraction_strategy
  if (batches.some(batch => batch.extraction_strategy !== strategy)) {
    throw new Error('Extraction telemetry cannot mix strategies in one run')
  }

  return {
    extraction_strategy: strategy,
    batch_count: batches.length,
    chunks_sent: batches.reduce((sum, batch) => sum + numeric(batch.chunks_sent), 0),
    total_chars: batches.reduce((sum, batch) => sum + numeric(batch.total_chars), 0),
    extracted_item_count: batches.reduce((sum, batch) => sum + numeric(batch.extracted_item_count), 0),
    persisted_item_count: batches.reduce((sum, batch) => sum + numeric(batch.persisted_item_count), 0),
    input_tokens: batches.reduce((sum, batch) => sum + numeric(batch.input_tokens), 0),
    output_tokens: batches.reduce((sum, batch) => sum + numeric(batch.output_tokens), 0),
    thinking_tokens: batches.reduce((sum, batch) => sum + numeric(batch.thinking_tokens), 0),
    total_tokens: batches.reduce((sum, batch) => sum + numeric(batch.total_tokens), 0),
    cached_tokens: batches.reduce((sum, batch) => sum + numeric(batch.cached_tokens), 0),
    provider_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.latency_ms), 0),
    chunk_fetch_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.chunk_fetch_latency_ms), 0),
    prompt_build_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.prompt_build_latency_ms), 0),
    persistence_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.persistence_latency_ms), 0),
    pipeline_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.pipeline_latency_ms), 0),
    total_latency_ms: batches.reduce((sum, batch) => sum + numeric(batch.total_latency_ms), 0),
  }
}

export function compareExtractionTelemetry(
  baseline: ExtractionRunTelemetry,
  candidate: ExtractionRunTelemetry,
): ExtractionTelemetryComparison {
  return {
    baseline_strategy: baseline.extraction_strategy,
    candidate_strategy: candidate.extraction_strategy,
    same_input: baseline.chunks_sent === candidate.chunks_sent
      && baseline.total_chars === candidate.total_chars,
    chunks_delta: candidate.chunks_sent - baseline.chunks_sent,
    chars_delta: candidate.total_chars - baseline.total_chars,
    extracted_items_delta: candidate.extracted_item_count - baseline.extracted_item_count,
    persisted_items_delta: candidate.persisted_item_count - baseline.persisted_item_count,
    total_tokens_delta: candidate.total_tokens - baseline.total_tokens,
    provider_latency_delta_ms: candidate.provider_latency_ms - baseline.provider_latency_ms,
    pipeline_latency_delta_ms: candidate.pipeline_latency_ms - baseline.pipeline_latency_ms,
    total_latency_delta_ms: candidate.total_latency_ms - baseline.total_latency_ms,
  }
}
