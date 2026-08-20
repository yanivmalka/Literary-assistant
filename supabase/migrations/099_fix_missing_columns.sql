-- Emergency repair migration: Add missing columns to fix migration sync issues

-- Add entity_id column to knowledge_branch_entities
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Add foreign key constraint for entity_id (drop first if exists)
ALTER TABLE IF EXISTS knowledge_branch_entities
DROP CONSTRAINT IF EXISTS fk_branch_entity_entity_id;

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT fk_branch_entity_entity_id 
FOREIGN KEY (entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE;

-- Make source_entity_id nullable
BEGIN;
  ALTER TABLE IF EXISTS knowledge_branch_entities
  DROP CONSTRAINT IF EXISTS fk_branch_entity_source_entity_id CASCADE;
  
  ALTER TABLE IF EXISTS knowledge_branch_entities
  ALTER COLUMN source_entity_id DROP NOT NULL;
  
  ALTER TABLE IF EXISTS knowledge_branch_entities
  ADD CONSTRAINT fk_branch_entity_source_entity_id 
  FOREIGN KEY (source_entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE;
COMMIT;

-- Add other missing columns
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}';

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS base_values JSONB DEFAULT '{}';

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS rejected_fields TEXT[] DEFAULT '{}';

-- Add branch_id column to knowledge_entities
ALTER TABLE IF EXISTS knowledge_entities
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add branch_id foreign key
ALTER TABLE IF EXISTS knowledge_entities
DROP CONSTRAINT IF EXISTS fk_entity_branch_id;

ALTER TABLE IF EXISTS knowledge_entities
ADD CONSTRAINT fk_entity_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_entity_branch_id ON knowledge_entities(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_entity_lookup ON knowledge_branch_entities(branch_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_branch_entity_source ON knowledge_branch_entities(source_entity_id);

-- Update entity_id from source_entity_id where needed
UPDATE knowledge_branch_entities 
SET entity_id = source_entity_id 
WHERE entity_id IS NULL AND source_entity_id IS NOT NULL;

-- Add unique constraint
ALTER TABLE IF EXISTS knowledge_branch_entities
DROP CONSTRAINT IF EXISTS uq_branch_entity;

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT uq_branch_entity UNIQUE (branch_id, entity_id);

-- Add NOT NULL check
ALTER TABLE IF EXISTS knowledge_branch_entities
DROP CONSTRAINT IF EXISTS check_entity_reference_not_null;

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT check_entity_reference_not_null 
CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL);
