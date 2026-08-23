-- ============================================
-- Dynamic place types and field definitions
-- Places remain knowledge_entities; this adds project-scoped schema metadata.
-- ============================================

CREATE TABLE IF NOT EXISTS public.knowledge_place_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL CHECK (type_key ~ '^[a-z0-9_\-]{1,80}$'),
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cosmic', 'geography', 'governance', 'settlement', 'structure', 'dwelling', 'custom')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, type_key)
);

CREATE TABLE IF NOT EXISTS public.knowledge_place_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  place_type_key TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_\-]{0,80}$'),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'long_text', 'number', 'boolean', 'select', 'multi_select')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  group_key TEXT NOT NULL DEFAULT 'custom',
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, place_type_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_place_types_project
  ON public.knowledge_place_types(project_id, category, label);
CREATE INDEX IF NOT EXISTS idx_knowledge_place_fields_project_type
  ON public.knowledge_place_field_definitions(project_id, place_type_key, sort_order);

ALTER TABLE public.knowledge_place_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_place_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view system and own place types" ON public.knowledge_place_types;
CREATE POLICY "Users can view system and own place types"
  ON public.knowledge_place_types FOR SELECT
  USING (is_system = true AND project_id IS NULL OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_place_types.project_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage own place types" ON public.knowledge_place_types;
CREATE POLICY "Users can manage own place types"
  ON public.knowledge_place_types FOR ALL
  USING (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_place_types.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (project_id IS NOT NULL AND is_system = false AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_place_types.project_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage own place field definitions" ON public.knowledge_place_field_definitions;
CREATE POLICY "Users can manage own place field definitions"
  ON public.knowledge_place_field_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_place_field_definitions.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = knowledge_place_field_definitions.project_id AND p.user_id = auth.uid()
  ) AND created_by = auth.uid());

DROP TRIGGER IF EXISTS knowledge_place_fields_updated_at ON public.knowledge_place_field_definitions;
CREATE TRIGGER knowledge_place_fields_updated_at
  BEFORE UPDATE ON public.knowledge_place_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.knowledge_place_types (project_id, type_key, label, category, is_system)
VALUES
  (NULL, 'universe', 'Universe', 'cosmic', true),
  (NULL, 'parallel_universe', 'Parallel universe', 'cosmic', true),
  (NULL, 'dimension', 'Dimension', 'cosmic', true),
  (NULL, 'plane', 'Plane', 'cosmic', true),
  (NULL, 'galaxy', 'Galaxy', 'cosmic', true),
  (NULL, 'star_system', 'Star system', 'cosmic', true),
  (NULL, 'world', 'World', 'cosmic', true),
  (NULL, 'moon', 'Moon', 'cosmic', true),
  (NULL, 'continent', 'Continent', 'geography', true),
  (NULL, 'subcontinent', 'Subcontinent', 'geography', true),
  (NULL, 'island', 'Island', 'geography', true),
  (NULL, 'archipelago', 'Archipelago', 'geography', true),
  (NULL, 'peninsula', 'Peninsula', 'geography', true),
  (NULL, 'sea', 'Sea', 'geography', true),
  (NULL, 'ocean', 'Ocean', 'geography', true),
  (NULL, 'lake', 'Lake', 'geography', true),
  (NULL, 'river', 'River', 'geography', true),
  (NULL, 'mountain', 'Mountain', 'geography', true),
  (NULL, 'mountain_range', 'Mountain range', 'geography', true),
  (NULL, 'desert', 'Desert', 'geography', true),
  (NULL, 'forest', 'Forest', 'geography', true),
  (NULL, 'natural_region', 'Natural region', 'geography', true),
  (NULL, 'country', 'Country', 'governance', true),
  (NULL, 'province', 'Province', 'governance', true),
  (NULL, 'kingdom', 'Kingdom', 'governance', true),
  (NULL, 'colony', 'Colony', 'governance', true),
  (NULL, 'empire', 'Empire', 'governance', true),
  (NULL, 'territory', 'Territory', 'governance', true),
  (NULL, 'principality', 'Principality', 'governance', true),
  (NULL, 'duchy', 'Duchy', 'governance', true),
  (NULL, 'republic', 'Republic', 'governance', true),
  (NULL, 'city_state', 'City-state', 'governance', true),
  (NULL, 'city', 'City', 'settlement', true),
  (NULL, 'capital', 'Capital city', 'settlement', true),
  (NULL, 'town', 'Town', 'settlement', true),
  (NULL, 'village', 'Village', 'settlement', true),
  (NULL, 'colony_settlement', 'Settlement colony', 'settlement', true),
  (NULL, 'settlement', 'Settlement', 'settlement', true),
  (NULL, 'farm', 'Farm', 'settlement', true),
  (NULL, 'fief', 'Fief', 'settlement', true),
  (NULL, 'trading_post', 'Trading post', 'settlement', true),
  (NULL, 'outpost', 'Outpost', 'settlement', true),
  (NULL, 'neighborhood', 'Neighborhood', 'structure', true),
  (NULL, 'district', 'District', 'structure', true),
  (NULL, 'street', 'Street', 'structure', true),
  (NULL, 'square', 'Square', 'structure', true),
  (NULL, 'market', 'Market', 'structure', true),
  (NULL, 'harbor', 'Harbor', 'structure', true),
  (NULL, 'complex', 'Complex', 'structure', true),
  (NULL, 'building', 'Building', 'structure', true),
  (NULL, 'villa', 'Villa', 'structure', true),
  (NULL, 'fort', 'Fort', 'structure', true),
  (NULL, 'castle', 'Castle', 'structure', true),
  (NULL, 'palace', 'Palace', 'structure', true),
  (NULL, 'temple', 'Temple', 'structure', true),
  (NULL, 'place_of_worship', 'Place of worship', 'structure', true),
  (NULL, 'tower', 'Tower', 'structure', true),
  (NULL, 'house', 'House', 'dwelling', true),
  (NULL, 'cabin', 'Cabin', 'dwelling', true),
  (NULL, 'apartment', 'Apartment', 'dwelling', true),
  (NULL, 'room', 'Room', 'dwelling', true),
  (NULL, 'tent', 'Tent', 'dwelling', true),
  (NULL, 'basement', 'Basement', 'dwelling', true),
  (NULL, 'attic', 'Attic', 'dwelling', true),
  (NULL, 'courtyard', 'Courtyard', 'dwelling', true),
  (NULL, 'garden', 'Garden', 'dwelling', true)
ON CONFLICT (project_id, type_key) DO NOTHING;

COMMENT ON TABLE public.knowledge_place_types IS 'System and project-specific place types; type keys never impose a containment hierarchy.';
COMMENT ON TABLE public.knowledge_place_field_definitions IS 'Project-specific custom fields shown for a place type; values remain on knowledge entities for backward compatibility.';
