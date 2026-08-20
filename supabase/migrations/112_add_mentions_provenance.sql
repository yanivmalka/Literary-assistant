-- Migration 112: Add chunk_id and page_number to knowledge_entity_mentions
-- Date: 2026-08-20
-- Purpose: Enable precise provenance tracking for entity mentions
--
-- This migration adds:
-- - chunk_id: FK to document_chunks for precise location tracking
-- - page_number: Direct page reference for UI display
--
-- These columns enable:
-- - Link mentions directly to source chunks
-- - Display page numbers in UI without joining to document_chunks
-- - Support future features like "jump to source" in document viewer

-- Add chunk_id column (nullable for backward compatibility)
ALTER TABLE knowledge_entity_mentions
ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL;

-- Add page_number column (nullable, may not be available for all documents)
ALTER TABLE knowledge_entity_mentions
ADD COLUMN IF NOT EXISTS page_number INT;

-- Create index for chunk-based queries
CREATE INDEX IF NOT EXISTS idx_entity_mentions_chunk_id ON knowledge_entity_mentions(chunk_id);

-- Create index for page-based queries
CREATE INDEX IF NOT EXISTS idx_entity_mentions_page_number ON knowledge_entity_mentions(page_number);

-- Comment explaining the new columns
COMMENT ON COLUMN knowledge_entity_mentions.chunk_id IS
'FK to document_chunks. Enables precise location tracking and joining to chunk content. NULL for legacy mentions or when chunk is deleted.';

COMMENT ON COLUMN knowledge_entity_mentions.page_number IS
'Page number where the mention appears. Copied from document_chunks.page for fast access. NULL if page information not available.';

-- Note: Existing rows will have NULL for these columns
-- A separate data backfill script can populate them if needed:
-- UPDATE knowledge_entity_mentions kem
-- SET chunk_id = dc.id, page_number = dc.page
-- FROM document_chunks dc
-- WHERE dc.version_id = (SELECT version_id FROM documents WHERE id = ...)
-- AND dc.position = kem.chunk_position;
