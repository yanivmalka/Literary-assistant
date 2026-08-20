-- Migration 100: Fix layer and entity_type constraints
-- Date: 2026-08-20
-- Purpose: Align deployed schema with approved v1.4 Phase 2 Main/Branch contract
--
-- Changes:
-- 1. Update knowledge_entities.layer constraint from 'main|secondary' to 'main|branch'
-- 2. Update knowledge_entities.entity_type constraint to include 'magic_ability' and 'event'
-- 3. Preserve all existing data (only character and location types are used)
--
-- Safety: Data validation confirms 0 layer='secondary' entities and 0 unsupported types

-- Drop existing constraints
ALTER TABLE knowledge_entities 
  DROP CONSTRAINT knowledge_entities_layer_check;

ALTER TABLE knowledge_entities 
  DROP CONSTRAINT knowledge_entities_entity_type_check;

-- Add new constraints matching approved contract
ALTER TABLE knowledge_entities 
  ADD CONSTRAINT knowledge_entities_layer_check 
  CHECK (layer IN ('main', 'branch'));

ALTER TABLE knowledge_entities 
  ADD CONSTRAINT knowledge_entities_entity_type_check 
  CHECK (entity_type IN ('character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event'));
