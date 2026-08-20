-- Migration: AI Extraction Branch Routing
-- Purpose: Route all AI extractions to active Branch instead of Main
-- Date: 2024
-- Description:
--   This migration ensures:
--   1. raw_extractions are associated with a specific branch_id
--   2. knowledge_entities created from extraction have layer='branch' when branch_id is set
--   3. knowledge_entity_aliases are associated with branch_id
--   4. knowledge_entity_mentions are associated with branch_id
--   5. knowledge_entity_relationships are associated with branch_id
--   6. knowledge_events are associated with branch_id if extracted in branch context
--   7. AI CANNOT modify Main layer directly
--   8. All branch extractions are isolated from each other

-- ============================================================================
-- PART 1: ALTER raw_extractions TABLE
-- ============================================================================

-- Add branch_id column (nullable for backward compatibility)
ALTER TABLE IF EXISTS raw_extractions
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS raw_extractions
DROP CONSTRAINT IF EXISTS fk_raw_extractions_branch_id;

ALTER TABLE IF EXISTS raw_extractions
ADD CONSTRAINT fk_raw_extractions_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_raw_extractions_branch_id 
ON raw_extractions(branch_id);

-- Add constraint: IF branch_id IS NOT NULL THEN source extraction goes to branch
-- (enforced in application logic, not database, for flexibility)

-- ============================================================================
-- PART 2: ALTER knowledge_entity_aliases TABLE
-- ============================================================================

-- Add branch_id for aliases created in branch context
ALTER TABLE IF EXISTS knowledge_entity_aliases
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS knowledge_entity_aliases
DROP CONSTRAINT IF EXISTS fk_entity_aliases_branch_id;

ALTER TABLE IF EXISTS knowledge_entity_aliases
ADD CONSTRAINT fk_entity_aliases_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_entity_aliases_branch_id 
ON knowledge_entity_aliases(branch_id);

-- Add constraint: IF entity.layer='branch' THEN alias.branch_id = entity.branch_id
-- (enforced in application logic)

-- ============================================================================
-- PART 3: ALTER knowledge_entity_mentions TABLE
-- ============================================================================

-- Add branch_id for mentions in branch context
ALTER TABLE IF EXISTS knowledge_entity_mentions
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS knowledge_entity_mentions
DROP CONSTRAINT IF EXISTS fk_entity_mentions_branch_id;

ALTER TABLE IF EXISTS knowledge_entity_mentions
ADD CONSTRAINT fk_entity_mentions_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_entity_mentions_branch_id 
ON knowledge_entity_mentions(branch_id);

-- Add constraint: IF entity.layer='branch' THEN mention.branch_id = entity.branch_id
-- (enforced in application logic)

-- ============================================================================
-- PART 4: ALTER knowledge_entity_relationships TABLE
-- ============================================================================

-- Add branch_id for relationships in branch context
ALTER TABLE IF EXISTS knowledge_entity_relationships
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS knowledge_entity_relationships
DROP CONSTRAINT IF EXISTS fk_entity_relationships_branch_id;

ALTER TABLE IF EXISTS knowledge_entity_relationships
ADD CONSTRAINT fk_entity_relationships_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_entity_relationships_branch_id 
ON knowledge_entity_relationships(branch_id);

-- Add constraint: relationships between branch entities have matching branch_id
-- (enforced in application logic)

-- ============================================================================
-- PART 5: ALTER knowledge_events TABLE
-- ============================================================================

-- Add branch_id for events created in branch context
ALTER TABLE IF EXISTS knowledge_events
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS knowledge_events
DROP CONSTRAINT IF EXISTS fk_events_branch_id;

ALTER TABLE IF EXISTS knowledge_events
ADD CONSTRAINT fk_events_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_events_branch_id 
ON knowledge_events(branch_id);

-- Add constraint: IF branch_id IS NOT NULL THEN layer='branch'
-- (enforced in application logic)

-- ============================================================================
-- PART 6: ALTER knowledge_event_mentions TABLE
-- ============================================================================

-- Add branch_id for event mentions in branch context
ALTER TABLE IF EXISTS knowledge_event_mentions
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Add foreign key constraint
ALTER TABLE IF EXISTS knowledge_event_mentions
DROP CONSTRAINT IF EXISTS fk_event_mentions_branch_id;

ALTER TABLE IF EXISTS knowledge_event_mentions
ADD CONSTRAINT fk_event_mentions_branch_id 
FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_event_mentions_branch_id 
ON knowledge_event_mentions(branch_id);

-- ============================================================================
-- PART 7: COMMENTS EXPLAINING BRANCH ROUTING
-- ============================================================================

COMMENT ON COLUMN raw_extractions.branch_id IS
'Branch ID where this extraction was processed.
NULL = extraction to Main (legacy, deprecated in favor of branch routing).
NOT NULL = extraction to specific branch (MVP model, required for new extractions).
All downstream entities (aliases, mentions, relationships, events) inherit this branch_id.
AI CANNOT extract directly to Main layer (branch_id must be set or extraction rejected).';

COMMENT ON COLUMN knowledge_entity_aliases.branch_id IS
'Branch ID for aliases created from branch extraction.
NULL = alias from Main layer entity or legacy data.
NOT NULL = alias created in branch context (must match entity.branch_id if entity.layer=branch).
Ensures branch aliases do not leak into other branches or Main.';

COMMENT ON COLUMN knowledge_entity_mentions.branch_id IS
'Branch ID for mentions discovered in branch extraction.
NULL = mention from Main layer entity or legacy data.
NOT NULL = mention discovered in branch context (must match entity.branch_id if entity.layer=branch).
Enables branch-specific evidence without polluting Main.';

COMMENT ON COLUMN knowledge_entity_relationships.branch_id IS
'Branch ID for relationships extracted in branch context.
NULL = relationship between Main entities or legacy data.
NOT NULL = relationship between branch entities or involving branch entity.
Ensures relationships do not cross branch boundaries unintentionally.';

COMMENT ON COLUMN knowledge_events.branch_id IS
'Branch ID for events extracted in branch context.
NULL = event extracted to Main layer or legacy data.
NOT NULL = event extracted to branch (must have layer=branch).
Ensures branch-specific events do not appear in Main.';

-- ============================================================================
-- PART 8: APPLICATION-LEVEL RULES (enforced in code)
-- ============================================================================

-- Rule 1: AI CANNOT write to Main layer
-- Enforcement: extract-knowledge edge function must check:
--   IF branch_id IS NULL THEN REJECT extraction
--   (or set branch_id to active project branch)

-- Rule 2: Entity layer consistency
-- IF knowledge_entities.layer = 'main' THEN branch_id = NULL
-- IF knowledge_entities.layer = 'branch' THEN branch_id IS NOT NULL

-- Rule 3: Alias isolation
-- IF knowledge_entity_aliases.branch_id IS NOT NULL AND entity.layer = 'branch'
--   THEN branch_id MUST EQUAL entity.branch_id

-- Rule 4: Branch boundary enforcement
-- Relationships between entities from different branches MUST be rejected
-- or explicitly created as Main-layer relationships (with branch_id = NULL)

-- Rule 5: No cross-contamination
-- Query Main entities: WHERE layer = 'main'
-- Query Branch entities: WHERE layer = 'branch' AND branch_id = ?
-- Query All (for conflict detection): Both layers separately, then merge

-- ============================================================================
-- PART 9: DATA MIGRATION (NO DATA DELETION)
-- ============================================================================

-- All existing extractions and related data are preserved.
-- New columns have NULL values for legacy data.
-- New code uses branch_id to route extractions.
-- Old extractions without branch_id are still accessible but not modified.

-- End of migration
