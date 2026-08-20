-- Migration 101: Enhance contradictions table for Knowledge-native model
-- Date: 2026-08-20
-- Purpose: Add required columns to support v1.4 Phase 2 canonical contradictions model
--
-- Changes:
-- 1. Add project_id (NOT NULL, FK to projects) — required for RLS scoping
-- 2. Add branch_id (nullable, FK to knowledge_branches) — NULL for Main, UUID for Branch
-- 3. Add field_path (TEXT, NOT NULL) — canonical field path (e.g. 'age', 'location.name')
-- 4. Add dedupe_key (TEXT, NOT NULL) — unique key for repeat-safe detection
-- 5. Preserve legacy attribute_a_id/attribute_b_id for backward compatibility during migration
-- 6. Note: value_a_id/value_b_id will be added in Phase 2 when knowledge_entity_values is created
--
-- Safety: Data validation confirms 0 existing contradictions, so no data loss

-- Add project_id column
-- Note: We need to set a temporary project_id for existing rows (if any).
-- Since there are 0 contradictions, we can use NOT NULL immediately.
ALTER TABLE contradictions 
  ADD COLUMN project_id UUID NOT NULL;

-- Add foreign key constraint for project_id
ALTER TABLE contradictions 
  ADD CONSTRAINT contradictions_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id);

-- Add branch_id column (nullable — NULL for Main, UUID for Branch)
ALTER TABLE contradictions 
  ADD COLUMN branch_id UUID;

-- Add foreign key constraint for branch_id
ALTER TABLE contradictions 
  ADD CONSTRAINT contradictions_branch_id_fkey 
  FOREIGN KEY (branch_id) REFERENCES knowledge_branches(id);

-- Add field_path column
ALTER TABLE contradictions 
  ADD COLUMN field_path TEXT NOT NULL;

-- Add dedupe_key column (used to prevent duplicate contradictions)
ALTER TABLE contradictions 
  ADD COLUMN dedupe_key TEXT NOT NULL;

-- Create unique constraint on dedupe_key to prevent duplicates
ALTER TABLE contradictions 
  ADD CONSTRAINT contradictions_dedupe_key_unique 
  UNIQUE (project_id, branch_id, dedupe_key);

-- Create index on project_id for query performance
CREATE INDEX IF NOT EXISTS idx_contradictions_project_id ON contradictions(project_id);

-- Create index on branch_id for query performance
CREATE INDEX IF NOT EXISTS idx_contradictions_branch_id ON contradictions(branch_id);

-- Create index on dedupe_key for repeat-safe detection
CREATE INDEX IF NOT EXISTS idx_contradictions_dedupe_key ON contradictions(dedupe_key);
