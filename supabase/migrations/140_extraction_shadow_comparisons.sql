-- ISOLATED SHADOW COMPARISON SINK
-- Candidate C results are stored here for evaluation only. This table is not
-- part of the Knowledge Layer and must never be joined into effective views.
-- ============================================

CREATE TABLE IF NOT EXISTS public.extraction_shadow_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version INTEGER NOT NULL DEFAULT 1,
  comparison_key TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shadow_run_id TEXT NOT NULL CHECK (shadow_run_id LIKE 'shadow:%'),
  baseline_raw_extraction_id UUID NOT NULL REFERENCES public.raw_extractions(id) ON DELETE CASCADE,
  baseline_branch_id UUID REFERENCES public.knowledge_branches(id) ON DELETE SET NULL,
  baseline_model_profile TEXT,
  baseline_extraction_strategy TEXT,
  candidate_model_profile TEXT NOT NULL
    CHECK (candidate_model_profile = 'sub-base-c-characters'),
  candidate_extraction_strategy TEXT NOT NULL
    CHECK (candidate_extraction_strategy = 'parallel-experts'),
  "offset" INTEGER NOT NULL CHECK ("offset" >= 0),
  chunk_limit INTEGER NOT NULL CHECK (chunk_limit > 0),
  chunk_positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_fingerprint TEXT NOT NULL,
  input_alignment TEXT NOT NULL DEFAULT 'unverified'
    CHECK (input_alignment IN ('unverified', 'verified')),
  baseline_payload JSONB NOT NULL,
  candidate_payload JSONB NOT NULL,
  baseline_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparison_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_model TEXT,
  candidate_primary_model TEXT,
  candidate_fallback_chain JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  thinking_tokens INTEGER,
  cached_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_comparisons_scope
  ON public.extraction_shadow_comparisons(project_id, version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_comparisons_run
  ON public.extraction_shadow_comparisons(shadow_run_id);
CREATE INDEX IF NOT EXISTS idx_shadow_comparisons_baseline
  ON public.extraction_shadow_comparisons(baseline_raw_extraction_id);
CREATE INDEX IF NOT EXISTS idx_shadow_comparisons_user
  ON public.extraction_shadow_comparisons(user_id, created_at DESC);

ALTER TABLE public.extraction_shadow_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own shadow comparisons" ON public.extraction_shadow_comparisons;
CREATE POLICY "Users can read own shadow comparisons"
  ON public.extraction_shadow_comparisons
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.extraction_shadow_comparisons IS
'Non-canonical evaluation rows for isolated shadow extraction. Never use this table as Knowledge Layer input or in effective entity views.';
COMMENT ON COLUMN public.extraction_shadow_comparisons.baseline_raw_extraction_id IS
'Explicit baseline selection. Runtime validates the complete project/document/version/user scope; latest-row selection is forbidden.';
COMMENT ON COLUMN public.extraction_shadow_comparisons.input_alignment IS
'Whether the baseline batch identity was verified. Existing raw_extractions rows lack offset/chunk identity, so current comparisons are explicitly unverified.';
COMMENT ON COLUMN public.extraction_shadow_comparisons.comparison_key IS
'Idempotency key derived from shadow run, explicit baseline, and candidate window.';
