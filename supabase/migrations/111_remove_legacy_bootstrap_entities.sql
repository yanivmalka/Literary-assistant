-- ============================================
-- MIGRATION 111: Remove Legacy Bootstrap Entities
-- ============================================
-- 
-- Bootstrap sentinel entities were used to mark Main layer initialization.
-- This is now handled implicitly: Main is considered initialized once real 
-- entities are inserted by the first extraction.
--
-- Safety Analysis:
-- - All FKs to knowledge_entities use ON DELETE CASCADE
-- - Bootstrap entities are purely synthetic (no real data)
-- - Application code filters bootstrap regardless
-- - No RLS policies prevent deletion
-- - Migration is idempotent (safe to run multiple times)
--
-- Cascade Deletions:
-- - knowledge_entity_aliases (by entity_id)
-- - knowledge_entity_mentions (by entity_id)
-- - knowledge_entity_relationships (by source_entity_id, target_entity_id)
-- - knowledge_branch_entities (by source_entity_id, entity_id)
-- - knowledge_event_participants (by entity_id)
-- - knowledge_entity_values (by entity_id)
-- - knowledge_contradictions (by entity_id)
-- ============================================

BEGIN;

-- Pre-deletion audit: verify affected rows
DO $$
DECLARE
  bootstrap_count INT;
  affected_projects INT;
BEGIN
  SELECT COUNT(*) INTO bootstrap_count
  FROM knowledge_entities
  WHERE canonical_name = '__bootstrap__' 
    AND layer = 'main' 
    AND source = 'ai';

  SELECT COUNT(DISTINCT project_id) INTO affected_projects
  FROM knowledge_entities
  WHERE canonical_name = '__bootstrap__' 
    AND layer = 'main' 
    AND source = 'ai';

  RAISE NOTICE '[Migration 111] Pre-deletion audit: % bootstrap entities across % projects', 
    bootstrap_count, affected_projects;
END $$;

-- Delete bootstrap entities (cascades handle all dependent rows)
DELETE FROM knowledge_entities
WHERE canonical_name = '__bootstrap__' 
  AND layer = 'main' 
  AND source = 'ai';

-- Post-deletion verification
DO $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM knowledge_entities
  WHERE canonical_name = '__bootstrap__';

  IF remaining_count = 0 THEN
    RAISE NOTICE '[Migration 111] SUCCESS: All bootstrap entities removed. Migration complete.';
  ELSE
    RAISE NOTICE '[Migration 111] INFO: % bootstrap entities remain (may have different characteristics)', remaining_count;
  END IF;
END $$;

COMMIT;
