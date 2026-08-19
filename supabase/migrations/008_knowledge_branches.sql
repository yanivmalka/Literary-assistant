-- ============================================
-- KNOWLEDGE BRANCHES
-- Main/Branch system for entity management.
-- Main = knowledge_entities with layer='main' (unchanged)
-- Branch = working copy in knowledge_branch_entities
-- ============================================

-- Branches table: tracks branch metadata per project
CREATE TABLE IF NOT EXISTS knowledge_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Branch',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'merged')),
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_branches_project ON knowledge_branches(project_id);
CREATE INDEX idx_knowledge_branches_user ON knowledge_branches(user_id);
CREATE INDEX idx_knowledge_branches_current ON knowledge_branches(project_id, user_id, is_current) WHERE is_current = true;

-- Branch entities: working copies of entities within a branch
-- Each row is a snapshot of an entity's editable fields in the branch context.
-- source_entity_id links back to the Main entity it was copied from.
CREATE TABLE IF NOT EXISTS knowledge_branch_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES knowledge_branches(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Editable fields (copied from Main, can be modified in branch)
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_types TEXT[] DEFAULT '{}',
  description TEXT,
  attributes JSONB DEFAULT '{}',
  -- Track modifications
  is_modified BOOLEAN NOT NULL DEFAULT false,
  modified_fields TEXT[] DEFAULT '{}',  -- list of field names that were changed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each entity appears once per branch
  UNIQUE(branch_id, source_entity_id)
);

CREATE INDEX idx_branch_entities_branch ON knowledge_branch_entities(branch_id);
CREATE INDEX idx_branch_entities_source ON knowledge_branch_entities(source_entity_id);
CREATE INDEX idx_branch_entities_project ON knowledge_branch_entities(project_id);
CREATE INDEX idx_branch_entities_modified ON knowledge_branch_entities(branch_id, is_modified) WHERE is_modified = true;

-- Function: When creating a branch, ensure only one is_current per project+user
CREATE OR REPLACE FUNCTION deactivate_other_branches()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE knowledge_branches
    SET is_current = false, updated_at = NOW()
    WHERE project_id = NEW.project_id
      AND user_id = NEW.user_id
      AND id != NEW.id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deactivate_other_branches
  BEFORE INSERT OR UPDATE ON knowledge_branches
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION deactivate_other_branches();

-- RLS policies for knowledge_branches
ALTER TABLE knowledge_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own branches"
  ON knowledge_branches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own branches"
  ON knowledge_branches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own branches"
  ON knowledge_branches FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own branches"
  ON knowledge_branches FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for knowledge_branch_entities
ALTER TABLE knowledge_branch_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own branch entities"
  ON knowledge_branch_entities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own branch entities"
  ON knowledge_branch_entities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own branch entities"
  ON knowledge_branch_entities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own branch entities"
  ON knowledge_branch_entities FOR DELETE
  USING (auth.uid() = user_id);
