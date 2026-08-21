-- ============================================
-- EXTRACTION MODEL PROFILES
-- Keep the selected extraction profile distinguishable from the concrete
-- Gemini model used after fallback, so profiles can evolve independently.
-- ============================================

ALTER TABLE IF EXISTS raw_extractions
  ADD COLUMN IF NOT EXISTS model_profile TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE IF EXISTS raw_extractions
  ADD COLUMN IF NOT EXISTS extraction_run_id TEXT;

ALTER TABLE IF EXISTS raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;

ALTER TABLE IF EXISTS raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('legacy', 'experimental'));

CREATE INDEX IF NOT EXISTS idx_raw_extractions_model_profile
  ON raw_extractions(model_profile);

CREATE INDEX IF NOT EXISTS idx_raw_extractions_extraction_run
  ON raw_extractions(project_id, user_id, extraction_run_id);
