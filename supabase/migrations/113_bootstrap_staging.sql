-- Migration 113: Bootstrap Staging Layer
-- Date: 2026-08-20
-- Purpose: Prevent partial Main layer initialization by using staged commits
--
-- This migration creates:
-- 1. bootstrap_stages table: Track bootstrap runs and their status
-- 2. bootstrap_entity_staging: Stage entities before committing to Main
--
-- Behavior:
-- - During first extraction (bootstrap mode), entities are created with layer='main_staging'
-- - After ALL batches complete successfully, staging rows are promoted to layer='main'
-- - If any batch fails, staging rows are either rolled back or marked as incomplete
-- - Main layer remains pristine until complete extraction succeeds

-- Bootstrap stages table: tracks extraction runs
CREATE TABLE IF NOT EXISTS bootstrap_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  extraction_run_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'rolled_back')),
  total_batches INT,
  completed_batches INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(project_id, user_id, extraction_run_id)
);

CREATE INDEX idx_bootstrap_stages_project ON bootstrap_stages(project_id);
CREATE INDEX idx_bootstrap_stages_extraction_run ON bootstrap_stages(extraction_run_id);
CREATE INDEX idx_bootstrap_stages_status ON bootstrap_stages(status);

-- Staging layer: holds entities during bootstrap before committing to Main
CREATE TABLE IF NOT EXISTS bootstrap_entity_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bootstrap_stage_id UUID NOT NULL REFERENCES bootstrap_stages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  -- Entity data (snapshot before commit)
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_types TEXT[] DEFAULT '{}',
  description TEXT,
  attributes JSONB DEFAULT '{}',
  structured_fields JSONB DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'ai',
  raw_extraction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bootstrap_staging_stage ON bootstrap_entity_staging(bootstrap_stage_id);
CREATE INDEX idx_bootstrap_staging_project ON bootstrap_entity_staging(project_id);
CREATE INDEX idx_bootstrap_staging_version ON bootstrap_entity_staging(version_id);

-- Comments
COMMENT ON TABLE bootstrap_stages IS
'Tracks bootstrap extraction runs. Prevents partial Main initialization by:
1. Starting with status=in_progress
2. Incrementing completed_batches as each batch succeeds
3. Only promoting staged entities to Main when status=completed
4. Rolling back or marking failed if any batch fails';

COMMENT ON TABLE bootstrap_entity_staging IS
'Holds entities during bootstrap. All entities created during first extraction
go here (layer=main_staging in application logic).
When bootstrap completes, these are promoted to knowledge_entities with layer=main.
If bootstrap fails, these rows can be deleted or remain as evidence.';

COMMENT ON COLUMN bootstrap_stages.status IS
'in_progress: extraction running
completed: all batches succeeded, ready to commit
failed: at least one batch failed, staged entities will not be promoted
rolled_back: staged entities have been deleted after failure';

COMMENT ON COLUMN bootstrap_stages.completed_batches IS
'Counter of batches that completed successfully. Used to detect mid-extraction failures.
If completed_batches < total_batches when extraction ends, bootstrap failed.';
