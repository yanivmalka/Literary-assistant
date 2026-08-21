-- Add structured provenance for the canonical extraction contract.
-- Existing evidence/chunk_position columns remain for backward compatibility.

ALTER TABLE IF EXISTS public.knowledge_entity_relationships
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.knowledge_events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.knowledge_event_mentions
  ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_relationships_metadata_gin
  ON public.knowledge_entity_relationships USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_events_metadata_gin
  ON public.knowledge_events USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_event_mentions_chunk
  ON public.knowledge_event_mentions(chunk_id);

COMMENT ON COLUMN public.knowledge_entity_relationships.metadata IS
  'Canonical extraction metadata: description, uncertainty and source_references.';
COMMENT ON COLUMN public.knowledge_events.metadata IS
  'Canonical extraction metadata: uncertainty and source_references.';
COMMENT ON COLUMN public.knowledge_event_mentions.chunk_id IS
  'Stable document chunk identifier for event provenance.';
