-- Migration 104: Create knowledge_entity_values table
-- Date: 2026-08-20
-- Purpose: Store canonical entity attribute values with provenance tracking
--
-- This table is the source of truth for entity attribute values, replacing the
-- legacy entity_attributes model. Each value is linked to evidence (chunks/quotes)
-- and supports Main/Branch semantics with user vs AI source tracking.
--
-- Structure:
-- - id: Primary key
-- - project_id: Required, scopes value to project (enables RLS)
-- - entity_id: Required, FK to knowledge_entities (Main or Branch entity)
-- - branch_id: Optional, NULL for Main, UUID for Branch overlay values
-- - field_path: Required, canonical path (e.g., 'age', 'location.name')
-- - value_json: Required, the actual value as JSON (supports any type)
-- - normalized_value: Optional, normalized string for comparison/deduplication
-- - source_type: Required, 'ai' or 'user' (determines precedence)
-- - value_status: Required, 'active|superseded|rejected'
-- - confidence: Optional, 0-1 confidence score for AI values
-- - raw_extraction_id: Optional, FK to raw_extractions for lineage
-- - supersedes_value_id: Optional, FK to previous value (chain of updates)
-- - created_by: Required, user_id who created/confirmed the value
-- - created_at: Timestamp
-- - updated_at: Timestamp

CREATE TABLE knowledge_entity_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES knowledge_branches(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  value_json JSONB NOT NULL,
  normalized_value TEXT,
  source_type TEXT NOT NULL DEFAULT 'ai' CHECK (source_type IN ('ai', 'user')),
  value_status TEXT NOT NULL DEFAULT 'active' CHECK (value_status IN ('active', 'superseded', 'rejected')),
  confidence DECIMAL(3,2),
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  supersedes_value_id UUID REFERENCES knowledge_entity_values(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_values_project_id ON knowledge_entity_values(project_id);
CREATE INDEX idx_values_entity_id ON knowledge_entity_values(entity_id);
CREATE INDEX idx_values_branch_id ON knowledge_entity_values(branch_id);
CREATE INDEX idx_values_field_path ON knowledge_entity_values(field_path);
CREATE INDEX idx_values_status ON knowledge_entity_values(value_status);
CREATE INDEX idx_values_source_type ON knowledge_entity_values(source_type);
CREATE INDEX idx_values_raw_extraction_id ON knowledge_entity_values(raw_extraction_id);

-- Composite index for effective value queries (Main + Branch with user preference)
CREATE INDEX idx_values_effective ON knowledge_entity_values(entity_id, field_path, source_type, value_status)
  WHERE value_status = 'active';

-- Enable RLS
ALTER TABLE knowledge_entity_values ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view/manage values for their projects
CREATE POLICY "Users manage own project values"
  ON knowledge_entity_values
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = knowledge_entity_values.project_id
        AND projects.user_id = auth.uid()
    )
  );
