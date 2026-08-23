-- SUB-BASE C KNOWLEDGE LAYER COMPATIBILITY
-- Additive schema support for character profile fields, provenance, and
-- dynamic field definitions. Existing Main/Branch tables remain canonical.
-- ============================================

-- Allow the already-implemented C profile through historical profile checks.
ALTER TABLE IF EXISTS public.raw_extractions
  DROP CONSTRAINT IF EXISTS raw_extractions_model_profile_check;
ALTER TABLE IF EXISTS public.raw_extractions
  ADD CONSTRAINT raw_extractions_model_profile_check
  CHECK (model_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations', 'sub-base-c-characters'));

ALTER TABLE IF EXISTS public.knowledge_branches
  DROP CONSTRAINT IF EXISTS knowledge_branches_profile_check;
ALTER TABLE IF EXISTS public.knowledge_branches
  ADD CONSTRAINT knowledge_branches_profile_check
  CHECK (profile IN ('sub-base', 'sub-base-2', 'sub-base-locations', 'sub-base-c-characters'));

ALTER TABLE IF EXISTS public.extraction_promotions
  DROP CONSTRAINT IF EXISTS extraction_promotions_source_profile_check,
  DROP CONSTRAINT IF EXISTS extraction_promotions_target_profile_check;
ALTER TABLE IF EXISTS public.extraction_promotions
  ADD CONSTRAINT extraction_promotions_source_profile_check
  CHECK (source_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations', 'sub-base-c-characters')),
  ADD CONSTRAINT extraction_promotions_target_profile_check
  CHECK (target_profile IN ('sub-base', 'sub-base-2', 'sub-base-locations', 'sub-base-c-characters'));

-- Dynamic character fields are project/profile scoped. Keep the existing
-- locations profile and add C without allowing legacy profiles to read them.
ALTER TABLE IF EXISTS public.knowledge_character_field_definitions
  DROP CONSTRAINT IF EXISTS knowledge_character_field_definitions_model_profile_check;
ALTER TABLE IF EXISTS public.knowledge_character_field_definitions
  ADD CONSTRAINT knowledge_character_field_definitions_model_profile_check
  CHECK (model_profile IN ('sub-base-locations', 'sub-base-c-characters'));

DROP POLICY IF EXISTS "Users can manage own dynamic character fields"
  ON public.knowledge_character_field_definitions;
CREATE POLICY "Users can manage own dynamic character fields"
  ON public.knowledge_character_field_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_character_field_definitions.project_id
      AND p.user_id = auth.uid()
  ))
  WITH CHECK (
    model_profile IN ('sub-base-locations', 'sub-base-c-characters')
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = knowledge_character_field_definitions.project_id
        AND p.user_id = auth.uid()
    )
  );

-- Preserve field-level inference and conflict metadata without changing the
-- existing value_json shape consumed by current clients.
ALTER TABLE IF EXISTS public.knowledge_entity_values
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Store page provenance alongside the existing chunk/offset evidence fields.
ALTER TABLE IF EXISTS public.knowledge_entity_value_evidence
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

COMMENT ON TABLE public.knowledge_character_field_definitions IS
  'Project-selected dynamic character fields for sub-base-locations and sub-base-c-characters only.';
COMMENT ON COLUMN public.knowledge_entity_values.metadata IS
  'AI provenance metadata including inferred, inference_note, conflict_group, and observation ordering.';
COMMENT ON COLUMN public.knowledge_entity_value_evidence.page_number IS
  'Page number copied from the source chunk when available.';
COMMENT ON COLUMN public.knowledge_branches.profile IS
  'Canonical extraction profile owning this isolated Branch, including sub-base-c-characters.';
