-- Project-selected dynamic character fields for the sub-base-locations profile only.
-- Values remain on knowledge_entities; this table stores the extraction/UI contract.

CREATE TABLE IF NOT EXISTS public.knowledge_character_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_profile TEXT NOT NULL DEFAULT 'sub-base-locations'
    CHECK (model_profile = 'sub-base-locations'),
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_\-]{0,80}$'),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'long_text', 'number', 'boolean', 'select', 'multi_select')),
  group_key TEXT NOT NULL DEFAULT 'custom',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, model_profile, field_key)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_character_fields_project_profile
  ON public.knowledge_character_field_definitions(project_id, model_profile, sort_order);

ALTER TABLE public.knowledge_character_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own dynamic character fields" ON public.knowledge_character_field_definitions;
CREATE POLICY "Users can manage own dynamic character fields"
  ON public.knowledge_character_field_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_character_field_definitions.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (
    model_profile = 'sub-base-locations'
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = knowledge_character_field_definitions.project_id AND p.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS knowledge_character_fields_updated_at ON public.knowledge_character_field_definitions;
CREATE TRIGGER knowledge_character_fields_updated_at
  BEFORE UPDATE ON public.knowledge_character_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.knowledge_character_field_definitions IS
  'Project-selected dynamic character fields. Deliberately restricted to sub-base-locations.';
