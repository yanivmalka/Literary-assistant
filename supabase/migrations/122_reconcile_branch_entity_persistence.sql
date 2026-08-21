-- Migration 122: Reconcile the Branch entity persistence contract
--
-- Development extraction writes a branch-only knowledge_entities row and a
-- knowledge_branch_entities mapping row. Keep this migration idempotent so
-- environments that received the older Branch migrations in a different order
-- still satisfy the current Edge Function contract.

BEGIN;

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS structured_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS base_values JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rejected_fields TEXT[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  ALTER COLUMN source_entity_id DROP NOT NULL;

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  DROP CONSTRAINT IF EXISTS fk_branch_entity_entity_id;

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  ADD CONSTRAINT fk_branch_entity_entity_id
  FOREIGN KEY (entity_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  DROP CONSTRAINT IF EXISTS check_entity_reference_not_null;

ALTER TABLE IF EXISTS public.knowledge_branch_entities
  ADD CONSTRAINT check_entity_reference_not_null
  CHECK (source_entity_id IS NOT NULL OR entity_id IS NOT NULL);

-- Existing overlay rows use source_entity_id as their entity identity. Populate
-- the new identity column before enforcing the branch-scoped uniqueness rule.
UPDATE public.knowledge_branch_entities
SET entity_id = source_entity_id
WHERE entity_id IS NULL
  AND source_entity_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.knowledge_branch_entities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.knowledge_branch_entities'::regclass
         AND conname = 'uq_branch_entity'
         AND contype = 'u'
     ) THEN
    ALTER TABLE public.knowledge_branch_entities
      ADD CONSTRAINT uq_branch_entity UNIQUE (branch_id, entity_id);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.knowledge_entities
  ADD COLUMN IF NOT EXISTS branch_id UUID;

ALTER TABLE IF EXISTS public.knowledge_entities
  DROP CONSTRAINT IF EXISTS fk_entity_branch_id;

ALTER TABLE IF EXISTS public.knowledge_entities
  ADD CONSTRAINT fk_entity_branch_id
  FOREIGN KEY (branch_id) REFERENCES public.knowledge_branches(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.knowledge_entities
  DROP CONSTRAINT IF EXISTS check_entity_branch_layer_consistency;

ALTER TABLE IF EXISTS public.knowledge_entities
  ADD CONSTRAINT check_entity_branch_layer_consistency
  CHECK (
    CASE
      WHEN layer = 'branch' THEN branch_id IS NOT NULL
      WHEN layer = 'main' THEN branch_id IS NULL
      ELSE TRUE
    END
  );

CREATE INDEX IF NOT EXISTS idx_branch_entity_lookup
  ON public.knowledge_branch_entities(branch_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_branch_id
  ON public.knowledge_entities(branch_id);

COMMIT;
