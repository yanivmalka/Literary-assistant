-- Migration 105: Create knowledge_entity_value_evidence table
-- Date: 2026-08-20
-- Purpose: Link entity values to their source evidence (chunks/quotes)
--
-- This table provides complete provenance for each value, allowing:
-- - Trace any value back to its source text and location
-- - Support contradiction detection based on conflicting evidence
-- - Validate repeat-safe contradiction detection
--
-- Structure:
-- - id: Primary key
-- - value_id: Required, FK to knowledge_entity_values
-- - chunk_id: Optional, FK to document_chunks (may be null for user-provided values)
-- - quote: Required, the actual text evidence
-- - position_start: Optional, character position in chunk
-- - position_end: Optional, character position in chunk
-- - raw_extraction_id: Optional, FK to raw_extractions for lineage
-- - created_at: Timestamp

CREATE TABLE knowledge_entity_value_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id UUID NOT NULL REFERENCES knowledge_entity_values(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  quote TEXT NOT NULL,
  position_start INTEGER,
  position_end INTEGER,
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Validate position range
  CONSTRAINT check_position_range CHECK (
    (position_start IS NULL AND position_end IS NULL)
    OR (position_start IS NOT NULL AND position_end IS NOT NULL AND position_start <= position_end)
  )
);

-- Indexes for common queries
CREATE INDEX idx_evidence_value_id ON knowledge_entity_value_evidence(value_id);
CREATE INDEX idx_evidence_chunk_id ON knowledge_entity_value_evidence(chunk_id);
CREATE INDEX idx_evidence_raw_extraction_id ON knowledge_entity_value_evidence(raw_extraction_id);

-- Composite index for finding all evidence for a value
CREATE INDEX idx_evidence_by_value ON knowledge_entity_value_evidence(value_id, created_at);

-- Enable RLS (inherit from parent value's project scope)
ALTER TABLE knowledge_entity_value_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view/manage evidence for values in their projects
CREATE POLICY "Users manage own value evidence"
  ON knowledge_entity_value_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_entity_values kev
      JOIN projects p ON p.id = kev.project_id
      WHERE kev.id = knowledge_entity_value_evidence.value_id
        AND p.user_id = auth.uid()
    )
  );
