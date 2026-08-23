-- PARALLEL EXPERT ARTIFACTS
-- Run-scoped, reviewable outputs from specialist models. These rows are not
-- canonical knowledge and must never be included in effective entity views.
-- ============================================

CREATE TABLE IF NOT EXISTS public.extraction_expert_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extraction_run_id TEXT NOT NULL,
  branch_id UUID REFERENCES public.knowledge_branches(id) ON DELETE CASCADE,
  model_profile TEXT NOT NULL,
  extraction_strategy TEXT NOT NULL DEFAULT 'parallel-experts'
    CHECK (extraction_strategy = 'parallel-experts'),
  role TEXT NOT NULL
    CHECK (role IN ('characters', 'locations', 'events')),
  window_id TEXT NOT NULL,
  offset INTEGER NOT NULL CHECK (offset >= 0),
  chunk_limit INTEGER NOT NULL CHECK (chunk_limit > 0),
  chunk_positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  model TEXT,
  raw_response JSONB,
  parsed_response JSONB,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  thinking_tokens INTEGER,
  cached_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (extraction_run_id, role, window_id)
);

CREATE INDEX IF NOT EXISTS idx_expert_artifacts_run
  ON public.extraction_expert_artifacts(project_id, extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_expert_artifacts_status
  ON public.extraction_expert_artifacts(extraction_run_id, status);
CREATE INDEX IF NOT EXISTS idx_expert_artifacts_user
  ON public.extraction_expert_artifacts(user_id, created_at DESC);

ALTER TABLE public.extraction_expert_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own expert artifacts" ON public.extraction_expert_artifacts;
CREATE POLICY "Users can read own expert artifacts"
  ON public.extraction_expert_artifacts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.extraction_expert_artifacts IS
'Run-scoped specialist outputs for parallel extraction. Artifacts are intermediate evidence and never canonical Knowledge Layer rows.';
COMMENT ON COLUMN public.extraction_expert_artifacts.extraction_run_id IS
'Run lineage shared by all specialist roles and the later merger.';
COMMENT ON COLUMN public.extraction_expert_artifacts.status IS
'Idempotent specialist lifecycle: pending, running, succeeded, or failed.';
