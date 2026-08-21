-- ============================================
-- RECONCILE EXTRACTION METADATA
--
-- Recovery migration for environments where the extraction function was
-- deployed before migrations 115-117 were applied. It is intentionally
-- idempotent so it can be run from the Supabase SQL Editor or through the
-- normal migration flow without duplicating columns, constraints, or indexes.
-- ============================================

DO $$
BEGIN
  IF to_regclass('public.raw_extractions') IS NULL THEN
    RAISE EXCEPTION
      'Cannot reconcile extraction metadata: public.raw_extractions does not exist. Apply the base schema migrations first.';
  END IF;
END $$;

ALTER TABLE public.raw_extractions
  ADD COLUMN IF NOT EXISTS extraction_run_id TEXT;

ALTER TABLE public.raw_extractions
  ADD COLUMN IF NOT EXISTS model_profile TEXT NOT NULL DEFAULT 'current';

-- Normalize the profile names used by the current Edge Function. This also
-- repairs databases that stopped after migration 115.
UPDATE public.raw_extractions
SET model_profile = 'current'
WHERE model_profile IS NULL OR model_profile = 'legacy';

UPDATE public.raw_extractions
SET model_profile = 'development'
WHERE model_profile = 'experimental';

ALTER TABLE public.raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;

ALTER TABLE public.raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('current', 'development'));

CREATE INDEX IF NOT EXISTS idx_raw_extractions_extraction_run
  ON public.raw_extractions(project_id, user_id, extraction_run_id);

CREATE INDEX IF NOT EXISTS idx_raw_extractions_model_profile
  ON public.raw_extractions(model_profile);
