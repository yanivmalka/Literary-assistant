-- ============================================
-- RENAME EXTRACTION MODEL PROFILES
-- Use clear names for the active and development profiles.
-- ============================================

-- Drop the legacy constraint before renaming existing values. Some databases
-- already contain current values from an earlier function deployment, so the
-- old constraint cannot remain in place while values are normalized.
ALTER TABLE IF EXISTS raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;

UPDATE raw_extractions
SET model_profile = 'current'
WHERE model_profile = 'legacy';

UPDATE raw_extractions
SET model_profile = 'development'
WHERE model_profile = 'experimental';

ALTER TABLE IF EXISTS raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('current', 'development'));
