-- Migration 109: Create the Knowledge-native contradictions table
-- Date: 2026-08-20
-- Purpose: Provide the relation used by the Knowledge contradiction detector.
--
-- The legacy `contradictions` table is retained for the existing document/entity
-- contradiction API. Knowledge contradictions use canonical Knowledge entities
-- and values, so they must be stored in a separate relation.

CREATE TABLE knowledge_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES knowledge_branches(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  value_a_id UUID NOT NULL REFERENCES knowledge_entity_values(id) ON DELETE CASCADE,
  value_b_id UUID NOT NULL REFERENCES knowledge_entity_values(id) ON DELETE CASCADE,
  contradiction_type TEXT NOT NULL DEFAULT 'attribute_conflict'
    CHECK (contradiction_type = 'attribute_conflict'),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'resolved_fix_profile',
      'resolved_fix_text',
      'resolved_intentional',
      'ignored'
    )),
  resolution_note TEXT,
  dedupe_key TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query indexes used by contradiction lists and value/entity resolution.
CREATE INDEX idx_knowledge_contradictions_project
  ON knowledge_contradictions(project_id);
CREATE INDEX idx_knowledge_contradictions_branch
  ON knowledge_contradictions(branch_id);
CREATE INDEX idx_knowledge_contradictions_entity
  ON knowledge_contradictions(entity_id);
CREATE INDEX idx_knowledge_contradictions_value_a
  ON knowledge_contradictions(value_a_id);
CREATE INDEX idx_knowledge_contradictions_value_b
  ON knowledge_contradictions(value_b_id);
CREATE INDEX idx_knowledge_contradictions_status
  ON knowledge_contradictions(status);

-- A NULL branch_id represents Main. COALESCE makes the dedupe rule apply to
-- Main rows as well as branch rows; PostgreSQL otherwise treats NULLs as distinct
-- in a regular UNIQUE constraint.
CREATE UNIQUE INDEX knowledge_contradictions_dedupe_key_unique
  ON knowledge_contradictions (
    project_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_key
  );

ALTER TABLE knowledge_contradictions ENABLE ROW LEVEL SECURITY;

-- Service-role Edge Functions bypass RLS for detection inserts. No INSERT
-- policy is intentionally granted to ordinary authenticated clients.
CREATE POLICY "Users can view own knowledge contradictions"
  ON knowledge_contradictions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = knowledge_contradictions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own knowledge contradictions"
  ON knowledge_contradictions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = knowledge_contradictions.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = knowledge_contradictions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own knowledge contradictions"
  ON knowledge_contradictions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = knowledge_contradictions.project_id
        AND projects.user_id = auth.uid()
    )
  );

COMMENT ON TABLE knowledge_contradictions IS
  'Knowledge-native contradictions between canonical entity values.';
COMMENT ON COLUMN knowledge_contradictions.dedupe_key IS
  'Repeat-safe contradiction key scoped by project and Main/Branch.';
