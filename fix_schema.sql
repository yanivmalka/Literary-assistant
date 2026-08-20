-- Direct fix for missing branch_id column in knowledge_entity_relationships
-- Run this in Supabase SQL Editor

-- Step 1: Add branch_id column if it doesn't exist
ALTER TABLE knowledge_entity_relationships
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Step 2: Add foreign key constraint for branch_id
ALTER TABLE knowledge_entity_relationships
DROP CONSTRAINT IF EXISTS fk_entity_relationships_branch_id;

ALTER TABLE knowledge_entity_relationships
ADD CONSTRAINT fk_entity_relationships_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Step 3: Add operation, review_status, base_exists columns if missing
ALTER TABLE knowledge_entity_relationships
ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'add',
ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS base_exists BOOLEAN NOT NULL DEFAULT true;

-- Step 4: Add constraints for valid values
ALTER TABLE knowledge_entity_relationships
DROP CONSTRAINT IF EXISTS knowledge_entity_relationships_operation_check;

ALTER TABLE knowledge_entity_relationships
ADD CONSTRAINT knowledge_entity_relationships_operation_check
CHECK (operation IN ('add', 'remove'));

ALTER TABLE knowledge_entity_relationships
DROP CONSTRAINT IF EXISTS knowledge_entity_relationships_review_status_check;

ALTER TABLE knowledge_entity_relationships
ADD CONSTRAINT knowledge_entity_relationships_review_status_check
CHECK (review_status IN ('pending', 'approved', 'rejected'));

-- Step 5: Create indexes on branch_id
CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_id 
ON knowledge_entity_relationships(branch_id);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_review
ON knowledge_entity_relationships(project_id, branch_id, review_status);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_endpoints
ON knowledge_entity_relationships(branch_id, source_entity_id, target_entity_id);

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'knowledge_entity_relationships'
ORDER BY ordinal_position;
