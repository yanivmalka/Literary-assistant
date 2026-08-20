-- Migration 110: canonical_name is a display attribute, not entity identity.
--
-- Entity identity is the UUID primary key on knowledge_entities.id.  Names may
-- legitimately repeat within Main or a Branch, so remove only the partial
-- canonical-name unique indexes introduced by migration 108.  The regular
-- canonical-name index from migration 007 remains useful for lookup.
--
-- This migration intentionally does not change the primary key, foreign keys,
-- layer/branch checks, overlay uniqueness, RLS, or any other integrity rule.

DROP INDEX IF EXISTS public.knowledge_entities_project_name_main_unique;
DROP INDEX IF EXISTS public.knowledge_entities_project_name_branch_unique;
