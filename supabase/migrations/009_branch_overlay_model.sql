-- Migration: Branch Overlay Model
-- Purpose: Implement the branch overlay model for knowledge entities
-- Date: 2024
-- Description:
--   This migration introduces a flexible override system where branch entities can:
--   1. Override specific fields from main entities (source_entity_id)
--   2. Create branch-only entities (source_entity_id = NULL)
--   3. Track changes, base values, and rejected suggestions

-- ============================================================================
-- PART 1: ALTER knowledge_branch_entities TABLE
-- ============================================================================

-- Add new columns for overlay model support
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD COLUMN IF NOT EXISTS entity_id UUID,
ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS base_values JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rejected_fields TEXT[] DEFAULT '{}';

-- Add foreign key constraint for entity_id
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT fk_branch_entity_entity_id 
FOREIGN KEY (entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE;

-- Make source_entity_id nullable and ensure it has the correct foreign key
-- First, drop the old constraint if it exists
ALTER TABLE IF EXISTS knowledge_branch_entities
DROP CONSTRAINT IF EXISTS fk_branch_entity_source_entity_id CASCADE;

-- Now add it back as nullable
ALTER TABLE IF EXISTS knowledge_branch_entities
ALTER COLUMN source_entity_id DROP NOT NULL;

-- Add the nullable foreign key constraint
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT fk_branch_entity_source_entity_id 
FOREIGN KEY (source_entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE;

-- Add constraint: source_entity_id and entity_id cannot both be NULL
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT check_entity_reference_not_null
CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL);

-- Drop the old unique constraint on (branch_id, source_entity_id)
ALTER TABLE IF EXISTS knowledge_branch_entities
DROP CONSTRAINT IF EXISTS uq_branch_source_entity CASCADE;

-- Add new unique constraint on (branch_id, entity_id)
-- First ensure entity_id is populated (if not already) by migrating data from source_entity_id
UPDATE knowledge_branch_entities 
SET entity_id = source_entity_id 
WHERE entity_id IS NULL AND source_entity_id IS NOT NULL;

-- Now add the unique constraint
ALTER TABLE IF EXISTS knowledge_branch_entities
ADD CONSTRAINT uq_branch_entity UNIQUE (branch_id, entity_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_branch_entity_lookup 
ON knowledge_branch_entities(branch_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_branch_entity_source 
ON knowledge_branch_entities(source_entity_id);

-- ============================================================================
-- PART 2: ALTER knowledge_entities TABLE
-- ============================================================================

-- Add branch_id column to knowledge_entities
ALTER TABLE IF EXISTS knowledge_entities
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key for branch_id
ALTER TABLE IF EXISTS knowledge_entities
ADD CONSTRAINT fk_entity_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add constraint: IF layer='branch' THEN branch_id IS NOT NULL
-- AND IF layer='main' THEN branch_id IS NULL
ALTER TABLE IF EXISTS knowledge_entities
ADD CONSTRAINT check_entity_branch_layer_consistency
CHECK (
  CASE
    WHEN layer = 'branch' THEN branch_id IS NOT NULL
    WHEN layer = 'main' THEN branch_id IS NULL
    ELSE TRUE
  END
);

-- Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_entity_branch_id 
ON knowledge_entities(branch_id);

CREATE INDEX IF NOT EXISTS idx_entity_layer_branch 
ON knowledge_entities(layer, branch_id);

-- ============================================================================
-- PART 3: COMMENTS EXPLAINING THE OVERLAY MODEL
-- ============================================================================

COMMENT ON COLUMN knowledge_branch_entities.source_entity_id IS
'Reference to the main entity (from knowledge_entities where layer=main) if this is an override.
NULL if this is a branch-only entity with no main entity counterpart.
Used to establish the parent-child relationship for override scenarios.';

COMMENT ON COLUMN knowledge_branch_entities.entity_id IS
'The actual entity ID (either main or branch layer).
For overrides: points to the branch entity that contains the changes.
For branch-only: points to the branch entity itself.
This is the primary entity reference and must not be NULL.';

COMMENT ON COLUMN knowledge_branch_entities.overrides IS
'JSONB containing only the fields that differ from the source entity.
This is a patch/delta, not a full snapshot.
Example: {"name": "Custom Name", "description": "Custom Desc"}
Reduces storage and makes conflict detection clearer.
Only populated when source_entity_id is not NULL.';

COMMENT ON COLUMN knowledge_branch_entities.base_values IS
'JSONB snapshot of the source entity field values at the time the override was created.
Used for conflict detection: if source entity changed, base_values will differ from current values.
Helps identify when suggestions need user review.
Only populated when source_entity_id is not NULL.';

COMMENT ON COLUMN knowledge_branch_entities.rejected_fields IS
'Array of field names that the user explicitly rejected in suggestions.
Prevents repeated suggestions for rejected fields.
Example: ARRAY[''description'', ''category'']
Cleared or updated when new suggestions are processed.';

COMMENT ON COLUMN knowledge_entities.branch_id IS
'Reference to the knowledge branch if this entity belongs to a branch (layer=branch).
NULL for all main layer entities.
Enforced by check constraint: IF layer=branch THEN branch_id IS NOT NULL.';

COMMENT ON TABLE knowledge_branch_entities IS
'Branch overlay model: tracks how branch entities relate to and override main entities.
Supports three scenarios:
1. Override: source_entity_id != NULL, entity_id points to branch version
2. Branch-only: source_entity_id = NULL, entity_id points to branch-only entity
3. Unmodified reference: source_entity_id != NULL, entity_id = source_entity_id, overrides = {}';

-- ============================================================================
-- PART 4: DATA MIGRATION (NO DATA DELETION)
-- ============================================================================
-- All existing data is preserved. The new columns have DEFAULT values.
-- Existing relationships are maintained through foreign key constraints.

-- End of migration
