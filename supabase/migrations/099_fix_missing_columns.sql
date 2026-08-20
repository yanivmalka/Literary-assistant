-- Emergency repair migration: Add missing columns to fix migration sync issues
-- This migration adds columns that should exist but may be missing due to migration history problems

-- Add entity_id column to knowledge_branch_entities (from 010_branch_overlay_model)
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Add foreign key constraint for entity_id
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT IF NOT EXISTS fk_branch_entity_entity_id 
FOREIGN KEY (entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE;

-- Make source_entity_id nullable
ALTER TABLE IF EXISTS knowledge_branch_entities
ALTER COLUMN source_entity_id DROP NOT NULL;

-- Add other missing columns from 010_branch_overlay_model
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS base_values JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rejected_fields TEXT[] DEFAULT '{}';

-- Add branch_id column to knowledge_entities (from 010_branch_overlay_model)
ALTER TABLE IF EXISTS knowledge_entities
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add branch_id foreign key for knowledge_entities
ALTER TABLE IF EXISTS knowledge_entities
ADD CONSTRAINT IF NOT EXISTS fk_entity_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_entity_branch_id 
ON knowledge_entities(branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_entity_lookup 
ON knowledge_branch_entities(branch_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_branch_entity_source 
ON knowledge_branch_entities(source_entity_id);

-- Ensure unique constraint on branch_entity
UPDATE knowledge_branch_entities 
SET entity_id = source_entity_id 
WHERE entity_id IS NULL AND source_entity_id IS NOT NULL;

ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT IF NOT EXISTS uq_branch_entity UNIQUE (branch_id, entity_id);

-- Ensure entity_id NOT NULL constraint
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT IF NOT EXISTS check_entity_reference_not_null
CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL);
