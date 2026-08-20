-- Migration 106: Add review_status to knowledge_entities
-- Date: 2026-08-20
-- Purpose: Track whether an entity has been reviewed/confirmed by the user
--
-- Review statuses:
-- - pending: AI-extracted, not yet confirmed by user
-- - confirmed: User has reviewed and approved this entity
-- - dismissed: User explicitly dismissed/removed this entity
-- - merged: Entity was merged into another (deferred for v1.5)
--
-- Default behavior:
-- - AI-extracted entities default to 'pending'
-- - User-created entities default to 'confirmed'
-- - AI must not reset confirmed entities on re-extraction
-- - Dismissal is user's way to remove unwanted AI entities

ALTER TABLE knowledge_entities
  ADD COLUMN review_status TEXT DEFAULT 'pending' NOT NULL
  CHECK (review_status IN ('pending', 'confirmed', 'dismissed', 'merged'));

-- Set existing entities to confirmed (legacy assumption: they were approved)
UPDATE knowledge_entities SET review_status = 'confirmed';

-- Create index for filtering entities by review status
CREATE INDEX idx_entities_review_status ON knowledge_entities(review_status);

-- Create index for finding pending user review
CREATE INDEX idx_entities_pending_review ON knowledge_entities(project_id, review_status)
  WHERE review_status = 'pending';
