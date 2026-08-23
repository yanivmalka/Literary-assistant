-- ============================================
-- SUB-BASE EXTRACTION PROFILES
-- Rename the existing profiles and add an isolated locations profile.
-- All three profiles share the same Gemini fallback chain initially, while
-- their Branch data and prompt evolution remain independent.
-- ============================================

-- raw_extractions profile history
ALTER TABLE IF EXISTS public.raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;

UPDATE public.raw_extractions
SET model_profile = CASE model_profile
  WHEN 'current' THEN 'sub-base'
  WHEN 'legacy' THEN 'sub-base'
  WHEN 'development' THEN 'sub-base-2'
  WHEN 'experimental' THEN 'sub-base-2'
  ELSE model_profile
END;

ALTER TABLE IF EXISTS public.raw_extractions
  ALTER COLUMN model_profile SET DEFAULT 'sub-base';

ALTER TABLE IF EXISTS public.raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations'));

-- Branch ownership is profile-scoped. Existing Branches retain their data,
-- but receive the new canonical profile identifiers.
ALTER TABLE IF EXISTS public.knowledge_branches
  DROP CONSTRAINT IF EXISTS knowledge_branches_profile_check;

UPDATE public.knowledge_branches
SET profile = CASE profile
  WHEN 'current' THEN 'sub-base'
  WHEN 'development' THEN 'sub-base-2'
  ELSE profile
END;

ALTER TABLE IF EXISTS public.knowledge_branches
  ALTER COLUMN profile SET DEFAULT 'sub-base';

ALTER TABLE IF EXISTS public.knowledge_branches
  ADD CONSTRAINT knowledge_branches_profile_check
  CHECK (profile IN ('sub-base', 'sub-base-2', 'sub-base-locations'));

-- Promotion records must use the same canonical profile identifiers as their
-- source and target Branches.
ALTER TABLE IF EXISTS public.extraction_promotions
  DROP CONSTRAINT IF EXISTS extraction_promotions_source_profile_check,
  DROP CONSTRAINT IF EXISTS extraction_promotions_target_profile_check;

UPDATE public.extraction_promotions
SET source_profile = CASE source_profile
      WHEN 'current' THEN 'sub-base'
      WHEN 'development' THEN 'sub-base-2'
      ELSE source_profile
    END,
    target_profile = CASE target_profile
      WHEN 'current' THEN 'sub-base'
      WHEN 'development' THEN 'sub-base-2'
      ELSE target_profile
    END;

ALTER TABLE IF EXISTS public.extraction_promotions
  ADD CONSTRAINT extraction_promotions_source_profile_check
  CHECK (source_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations')),
  ADD CONSTRAINT extraction_promotions_target_profile_check
  CHECK (target_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations'));

COMMENT ON COLUMN public.knowledge_branches.profile IS
'Canonical extraction profile owning this isolated Branch: sub-base, sub-base-2, or sub-base-locations.';
