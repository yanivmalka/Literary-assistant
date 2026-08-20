-- Task 5: branch-scoped relationship proposals and independent review.
-- Uses knowledge_entity_relationships; no parallel relationship table is required.

-- CRITICAL: Add branch_id column FIRST before creating indexes on it
ALTER TABLE IF EXISTS knowledge_entity_relationships
  ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint for branch_id
ALTER TABLE IF EXISTS knowledge_entity_relationships
  DROP CONSTRAINT IF EXISTS fk_entity_relationships_branch_id;

ALTER TABLE IF EXISTS knowledge_entity_relationships
  ADD CONSTRAINT fk_entity_relationships_branch_id 
  FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Now add the operation, review_status, and base_exists columns
ALTER TABLE IF EXISTS knowledge_entity_relationships
  ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'add',
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS base_exists BOOLEAN NOT NULL DEFAULT true;

-- Recreate named checks idempotently so invalid relationship workflow states cannot
-- be persisted. Existing legacy/Main relationships remain approved additions.
ALTER TABLE IF EXISTS knowledge_entity_relationships
  DROP CONSTRAINT IF EXISTS knowledge_entity_relationships_operation_check,
  DROP CONSTRAINT IF EXISTS knowledge_entity_relationships_review_status_check;

ALTER TABLE IF EXISTS knowledge_entity_relationships
  ADD CONSTRAINT knowledge_entity_relationships_operation_check
    CHECK (operation IN ('add', 'remove')),
  ADD CONSTRAINT knowledge_entity_relationships_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected'));

DROP INDEX IF EXISTS idx_entity_relationships_branch_review;
CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_review
  ON knowledge_entity_relationships(project_id, branch_id, review_status);

DROP INDEX IF EXISTS idx_entity_relationships_branch_endpoints;
CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_endpoints
  ON knowledge_entity_relationships(branch_id, source_entity_id, target_entity_id);

COMMENT ON COLUMN knowledge_entity_relationships.operation IS
  'Branch relationship proposal operation: add creates an edge; remove tombstones a Main edge without deleting Main.';

COMMENT ON COLUMN knowledge_entity_relationships.review_status IS
  'Independent relationship review state. Pending and rejected Branch rows do not affect the effective graph.';

COMMENT ON COLUMN knowledge_entity_relationships.base_exists IS
  'True when the same relationship exists in Main at proposal time; used for conflict detection and remove semantics.';

-- New AI rows are required to use branch_id, operation=add, and review_status=pending
-- in the extract-knowledge application path. Legacy rows retain their compatible
-- NULL branch_id and approved defaults.
