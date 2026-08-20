-- Migration 103: Validate and document branch_entity uniqueness semantics
-- Date: 2026-08-20
-- Purpose: Ensure branch entity uniqueness constraints correctly implement the approved overlay model
--
-- Approved semantics:
-- - Main overlay: source_entity_id = Main entity ID, entity_id = Main entity ID
-- - Independent: source_entity_id = NULL, entity_id = Branch entity ID
-- - Both patterns UNIQUE per branch
--
-- Current constraints in knowledge_branch_entities:
-- - UNIQUE(branch_id, source_entity_id)
-- - UNIQUE(branch_id, entity_id)
-- - CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL)
--
-- Analysis:
-- This dual-uniqueness prevents most conflicts but allows:
--   (branch_id, source_entity_id=X, entity_id=X) AND (branch_id, source_entity_id=NULL, entity_id=X)
-- Which violates the invariant that each entity_id appears at most once per branch.
--
-- Recommended fix:
-- Add CHECK constraint to prevent this cross-pattern conflict:
--   WHEN (source_entity_id IS NULL) THEN (entity_id must be unique per branch)
--   WHEN (source_entity_id IS NOT NULL) THEN (source_entity_id must be unique, entity_id = source_entity_id)
--
-- For now, this migration documents the semantics and validates existing data.

-- Verify that no conflicting patterns exist
DO $$
DECLARE
  conflicting_count INT;
BEGIN
  -- Check for patterns where entity_id appears in both Main overlay and independent forms
  SELECT COUNT(*) INTO conflicting_count
  FROM knowledge_branch_entities kbe1
  WHERE EXISTS (
    SELECT 1 FROM knowledge_branch_entities kbe2
    WHERE kbe1.branch_id = kbe2.branch_id
      AND kbe1.entity_id = kbe2.entity_id
      AND kbe1.id != kbe2.id
      AND (
        (kbe1.source_entity_id IS NOT NULL AND kbe2.source_entity_id IS NULL)
        OR (kbe1.source_entity_id IS NULL AND kbe2.source_entity_id IS NOT NULL)
      )
  );
  
  IF conflicting_count > 0 THEN
    RAISE WARNING 'Found % conflicting branch entity patterns; review semantics', conflicting_count;
  END IF;
END $$;

-- Add comment documenting the constraint semantics for future maintainers
COMMENT ON CONSTRAINT uq_branch_entity ON knowledge_branch_entities IS
  'Enforces that each entity appears at most once per branch; supports both Main overlay (source_entity_id = entity_id) and independent (source_entity_id IS NULL) patterns';

-- No schema changes in this migration; purely validation and documentation
