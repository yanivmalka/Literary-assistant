-- Migration 108: Scope knowledge entity names to Main and Branch layers
-- Purpose: Replace the legacy project-wide name index with architecture-aware uniqueness.
--
-- The legacy index enforced one canonical name per project across all non-versioned
-- rows. That prevents a Branch entity from using the same name as its Main entity
-- or as an entity in another Branch. Main and Branch entities have separate scopes
-- in the current architecture, so they require separate partial unique indexes.
--
-- This migration changes indexes only. It does not modify data, layer constraints,
-- branch constraints, versioned-entity uniqueness, or the overlay model.

DROP INDEX IF EXISTS public.knowledge_entities_project_name_user_unique;

-- Main entities remain unique by canonical name within a project.
CREATE UNIQUE INDEX knowledge_entities_project_name_main_unique
  ON public.knowledge_entities (project_id, canonical_name)
  WHERE version_id IS NULL
    AND layer = 'main';

-- Branch-only entities are unique by canonical name within a project and branch.
-- A Branch may therefore reuse a Main name or a name used by another Branch.
CREATE UNIQUE INDEX knowledge_entities_project_name_branch_unique
  ON public.knowledge_entities (project_id, branch_id, canonical_name)
  WHERE version_id IS NULL
    AND layer = 'branch';
