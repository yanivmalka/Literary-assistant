-- EXTRACTION STRATEGIES
-- Keep the existing sequential extraction path stable while recording the
-- run-level strategy selected for future orchestration modes.
-- ============================================

ALTER TABLE IF EXISTS public.raw_extractions
  ADD COLUMN IF NOT EXISTS extraction_strategy TEXT NOT NULL DEFAULT 'legacy-sequential';

ALTER TABLE IF EXISTS public.raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_extraction_strategy_check;

ALTER TABLE IF EXISTS public.raw_extractions
  ADD CONSTRAINT raw_extractions_extraction_strategy_check
  CHECK (extraction_strategy IN ('legacy-sequential', 'parallel-experts'));

CREATE INDEX IF NOT EXISTS idx_raw_extractions_extraction_strategy
  ON public.raw_extractions(extraction_strategy);

COMMENT ON COLUMN public.raw_extractions.extraction_strategy IS
'Run-level extraction orchestration strategy. legacy-sequential preserves the existing pipeline; parallel-experts is reserved for the staged specialist orchestrator.';
