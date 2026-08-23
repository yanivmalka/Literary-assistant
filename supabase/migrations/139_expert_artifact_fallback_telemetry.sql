-- ADDITIVE TELEMETRY FOR SPECIALIST MODEL SELECTION
-- Preserves existing extraction_expert_artifacts rows and adds the metadata
-- needed to audit Model A and future specialist fallback behavior.

ALTER TABLE IF EXISTS public.extraction_expert_artifacts
  ADD COLUMN IF NOT EXISTS artifact_contract TEXT NOT NULL DEFAULT 'expert-extraction-v1',
  ADD COLUMN IF NOT EXISTS primary_model TEXT,
  ADD COLUMN IF NOT EXISTS fallback_chain JSONB;

COMMENT ON COLUMN public.extraction_expert_artifacts.artifact_contract IS
'Contract used to validate parsed_response, for example expert-extraction-v1 or character-specialist-v1.';
COMMENT ON COLUMN public.extraction_expert_artifacts.primary_model IS
'The first model in the requested model chain for this specialist invocation.';
COMMENT ON COLUMN public.extraction_expert_artifacts.fallback_chain IS
'Complete ordered provider attempt telemetry, including successful, failed, skipped, and safety-block attempts.';
