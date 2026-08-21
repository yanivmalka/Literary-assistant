-- ============================================
-- PROFILE-SCOPED EXTRACTION BRANCHES
-- Keep current and development extraction results in separate Branches.
-- ============================================

ALTER TABLE IF EXISTS knowledge_branches
  ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'current';

ALTER TABLE IF EXISTS knowledge_branches
  DROP CONSTRAINT IF EXISTS knowledge_branches_profile_check;

ALTER TABLE IF EXISTS knowledge_branches
  ADD CONSTRAINT knowledge_branches_profile_check
  CHECK (profile IN ('current', 'development'));

-- Keep one active Branch per project, user, and profile before adding the
-- uniqueness guard. Existing rows are retained; the newest remains current.
WITH ranked_current AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, user_id, profile
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM knowledge_branches
  WHERE is_current = true AND status = 'active'
)
UPDATE knowledge_branches AS branches
SET is_current = false,
    updated_at = NOW()
FROM ranked_current
WHERE branches.id = ranked_current.id
  AND ranked_current.row_number > 1;

CREATE INDEX IF NOT EXISTS idx_knowledge_branches_profile
  ON knowledge_branches(project_id, user_id, profile);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_branches_current_profile
  ON knowledge_branches(project_id, user_id, profile)
  WHERE is_current = true AND status = 'active';

CREATE OR REPLACE FUNCTION deactivate_other_branches()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE knowledge_branches
    SET is_current = false, updated_at = NOW()
    WHERE project_id = NEW.project_id
      AND user_id = NEW.user_id
      AND profile = NEW.profile
      AND id != NEW.id
      AND is_current = true
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN knowledge_branches.profile IS
'Extraction profile owning this Branch. current and development are isolated;
only explicitly reviewed data may be promoted between profiles.';
