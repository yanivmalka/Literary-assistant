-- ============================================
-- MIGRATION 111: Remove Legacy Bootstrap Entities
-- ============================================
-- 
-- Bootstrap sentinel entities were used to mark Main layer initialization.
-- This is now handled implicitly: Main is considered initialized once real 
-- entities are inserted by the first extraction.
--
-- This migration:
-- 1. Safely deletes any legacy __bootstrap__ entities
-- 2. Does NOT modify projects table (bootstrap_initialized flag not needed)
-- 3. Preserves all real Main entities
--
-- Safety:
-- - Uses explicit filter to target only bootstrap entities
-- - Cascade deletes will remove associated mentions, aliases, relationships
-- - No data loss: bootstrap was always a sentinel, never contained real data
-- ============================================

DELETE FROM knowledge_entities
WHERE canonical_name = '__bootstrap__' AND layer = 'main' AND source = 'ai';

-- Log confirmation
SELECT 
  COUNT(*) as remaining_bootstrap_entities,
  'Cleanup complete' as status
FROM knowledge_entities 
WHERE canonical_name = '__bootstrap__';
