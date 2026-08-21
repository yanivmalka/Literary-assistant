-- ============================================
-- SET CURRENT EXTRACTION PROFILE DEFAULT
--
-- Migration 115 introduced a legacy default. Migration 117 renamed the
-- allowed values, but did not update the default. Keep new raw extraction
-- rows aligned with the active Edge Function profile.
-- ============================================

ALTER TABLE public.raw_extractions
  ALTER COLUMN model_profile SET DEFAULT 'current';
