import { describe, expect, it } from 'vitest'
import {
  aggregateExtractionTelemetry,
  compareExtractionTelemetry,
  type ExtractionBatchTelemetry,
} from '../extractionTelemetry'

function batch(strategy: ExtractionBatchTelemetry['extraction_strategy'], latency: number): ExtractionBatchTelemetry {
  return {
    extraction_strategy: strategy,
    chunks_sent: 2,
    total_chars: 100,
    extracted_item_count: 4,
    persisted_item_count: 3,
    input_tokens: 10,
    output_tokens: 5,
    thinking_tokens: 1,
    total_tokens: 16,
    cached_tokens: 2,
    latency_ms: latency,
    chunk_fetch_latency_ms: 3,
    prompt_build_latency_ms: 4,
    persistence_latency_ms: 5,
    pipeline_latency_ms: latency + 8,
    total_latency_ms: latency + 10,
  }
}

describe('extraction telemetry comparison', () => {
  it('aggregates each run without mixing strategies', () => {
    const legacy = aggregateExtractionTelemetry([batch('legacy-sequential', 20), batch('legacy-sequential', 25)])
    expect(legacy).toMatchObject({
      extraction_strategy: 'legacy-sequential',
      batch_count: 2,
      chunks_sent: 4,
      total_chars: 200,
      extracted_item_count: 8,
      persisted_item_count: 6,
      total_tokens: 32,
      provider_latency_ms: 45,
    })
    expect(() => aggregateExtractionTelemetry([batch('legacy-sequential', 20), batch('parallel-experts', 10)]))
      .toThrow('cannot mix strategies')
  })

  it('compares equivalent input while preserving strategy-specific latency deltas', () => {
    const baseline = aggregateExtractionTelemetry([batch('legacy-sequential', 40)])
    const parallel = aggregateExtractionTelemetry([batch('parallel-experts', 25)])
    const comparison = compareExtractionTelemetry(baseline, parallel)

    expect(comparison).toMatchObject({
      baseline_strategy: 'legacy-sequential',
      candidate_strategy: 'parallel-experts',
      same_input: true,
      chunks_delta: 0,
      chars_delta: 0,
      total_latency_delta_ms: -15,
      provider_latency_delta_ms: -15,
    })
  })
})
