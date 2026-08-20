-- Migration 107: Add value references to knowledge_contradictions
-- Date: 2026-08-20
-- Purpose: Link contradictions to the canonical values that conflict
--
-- The knowledge_contradictions table was enhanced in migration 101 with:
-- - project_id, branch_id, field_path, dedupe_key
--
-- This migration adds the final required columns:
-- - value_a_id: FK to knowledge_entity_values (first conflicting value)
-- - value_b_id: FK to knowledge_entity_values (second conflicting value)
--
-- These columns reference the canonical values, enabling:
-- - Repeat-safe detection: dedupe_key prevents duplicates
-- - Full lineage: trace each contradiction to its source values
-- - Resolution: user can reject one value, keeping the other active
--
-- Note: These columns are initially nullable to support legacy data.
-- New contradictions MUST populate both columns.

ALTER TABLE contradictions
  ADD COLUMN value_a_id UUID REFERENCES knowledge_entity_values(id) ON DELETE SET NULL,
  ADD COLUMN value_b_id UUID REFERENCES knowledge_entity_values(id) ON DELETE SET NULL;

-- Create indexes for contradiction queries
CREATE INDEX idx_contradictions_value_a_id ON contradictions(value_a_id);
CREATE INDEX idx_contradictions_value_b_id ON contradictions(value_b_id);

-- Composite index for finding contradictions for a specific value
CREATE INDEX idx_contradictions_by_values ON contradictions(value_a_id, value_b_id);

-- Add comments explaining the v1.4/v1.5 transition
COMMENT ON COLUMN contradictions.attribute_a_id IS
  'Legacy column; v1.4 contradictions use value_a_id and value_b_id instead';
COMMENT ON COLUMN contradictions.attribute_b_id IS
  'Legacy column; v1.4 contradictions use value_a_id and value_b_id instead';
COMMENT ON COLUMN contradictions.value_a_id IS
  'v1.4+: FK to knowledge_entity_values; source of first conflicting value';
COMMENT ON COLUMN contradictions.value_b_id IS
  'v1.4+: FK to knowledge_entity_values; source of second conflicting value';
