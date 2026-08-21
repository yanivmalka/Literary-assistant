-- ============================================
-- RENAME EXTRACTION MODEL PROFILES
-- Use clear names for the active and development profiles.
-- ============================================

UPDATE raw_extractions
SET model_profile = 'current'
WHERE model_profile = 'legacy';

UPDATE raw_extractions
SET model_profile = 'development'
WHERE model_profile = 'experimental';

ALTER TABLE IF EXISTS raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;

ALTER TABLE IF EXISTS raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('current', 'development'));
