-- ============================================
-- EXTRACTION RUN LINEAGE
-- Persist the run identity used to authorize bootstrap continuation batches.
-- ============================================

ALTER TABLE IF EXISTS raw_extractions
  ADD COLUMN IF NOT EXISTS extraction_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_raw_extractions_extraction_run
  ON raw_extractions(project_id, user_id, extraction_run_id);
