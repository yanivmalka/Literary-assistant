-- ============================================
-- ADD structured_fields COLUMN TO knowledge_entities
-- Stores the typed, per-entity-type fields (CharacterFields, LocationFields, etc.)
-- All fields within the JSONB are nullable — partial entities are valid.
-- ============================================

-- Add structured_fields if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_entities' AND column_name = 'structured_fields'
  ) THEN
    ALTER TABLE knowledge_entities ADD COLUMN structured_fields JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add source column if it doesn't already exist
-- Values: 'ai' (extracted by AI), 'user' (created manually)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_entities' AND column_name = 'source'
  ) THEN
    ALTER TABLE knowledge_entities ADD COLUMN source TEXT DEFAULT 'ai';
  END IF;
END $$;

-- Add structured_fields to branch entities for Main/Branch consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_branch_entities' AND column_name = 'structured_fields'
  ) THEN
    ALTER TABLE knowledge_branch_entities ADD COLUMN structured_fields JSONB DEFAULT '{}';
  END IF;
END $$;
