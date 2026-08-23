-- EXTRACTION PERFORMANCE TELEMETRY
-- Preserve provider latency while recording pipeline stages for baseline and
-- future parallel-experts comparisons.
-- ============================================

ALTER TABLE IF EXISTS public.raw_extractions
  ADD COLUMN IF NOT EXISTS total_chars INTEGER,
  ADD COLUMN IF NOT EXISTS extracted_item_count INTEGER,
  ADD COLUMN IF NOT EXISTS persisted_item_count INTEGER,
  ADD COLUMN IF NOT EXISTS chunk_fetch_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS prompt_build_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS persistence_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS pipeline_latency_ms INTEGER;

COMMENT ON COLUMN public.raw_extractions.latency_ms IS
'Gemini provider latency for the selected model attempt; not the complete extraction pipeline duration.';

COMMENT ON COLUMN public.raw_extractions.pipeline_latency_ms IS
'Handler latency from request start through entity/relationship/event persistence, excluding final usage charging.';
