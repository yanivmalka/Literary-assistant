-- Migration 114: Entity Resolution Suggestions
-- Date: 2026-08-20
-- Purpose: Persist medium-confidence (70-99) entity consolidation suggestions for user review
--
-- This migration creates:
-- 1. entity_resolution_suggestions table: Store potential merges
-- 2. resolution_suggestion_signals table: Track evidence for each suggestion
--
-- Workflow:
-- 1. During extraction, consolidations with score 70-99 are saved as pending suggestions
-- 2. User can review suggestions in the UI
-- 3. User accepts (consolidate) or rejects (keep separate)
-- 4. After user decision, suggestion marked as approved/rejected

-- Entity resolution suggestions table
CREATE TABLE IF NOT EXISTS entity_resolution_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Keep ownership as a UUID, consistent with the extraction tables. The
  -- deployed database does not contain the optional public.profiles table;
  -- project ownership is enforced by the RLS policies below.
  user_id UUID NOT NULL,
  -- The two entities being considered for consolidation
  entity_a_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  entity_b_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  -- Suggestion metadata
  score INT NOT NULL CHECK (score >= 70 AND score < 100),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  -- Lineage
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES knowledge_branches(id) ON DELETE SET NULL,
  -- User review
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'implemented')),
  user_decision_at TIMESTAMPTZ,
  -- If approved, the canonical name to use after merge
  proposed_canonical_name TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Uniqueness: One suggestion per entity pair per project
  UNIQUE(project_id, entity_a_id, entity_b_id)
);

CREATE INDEX idx_suggestions_project ON entity_resolution_suggestions(project_id);
CREATE INDEX idx_suggestions_entities ON entity_resolution_suggestions(entity_a_id, entity_b_id);
CREATE INDEX idx_suggestions_status ON entity_resolution_suggestions(review_status);
CREATE INDEX idx_suggestions_branch ON entity_resolution_suggestions(branch_id);
CREATE INDEX idx_suggestions_pending ON entity_resolution_suggestions(project_id, review_status) WHERE review_status = 'pending';

-- Resolution signals: tracks the evidence for each suggestion
CREATE TABLE IF NOT EXISTS entity_resolution_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES entity_resolution_suggestions(id) ON DELETE CASCADE,
  -- Signal type
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'prefix_match', 
    'co_location', 
    'matching_description',
    'matching_relationships',
    'name_similarity',
    'shared_attributes',
    'contradictory_context'
  )),
  points INT NOT NULL,
  -- Evidence
  evidence_text TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signals_suggestion ON entity_resolution_signals(suggestion_id);
CREATE INDEX idx_signals_type ON entity_resolution_signals(signal_type);

-- Enable RLS
ALTER TABLE entity_resolution_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_resolution_signals ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view/manage their own suggestions
CREATE POLICY "Users view own suggestions"
  ON entity_resolution_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = entity_resolution_suggestions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own suggestions"
  ON entity_resolution_suggestions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = entity_resolution_suggestions.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users view suggestion signals"
  ON entity_resolution_signals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM entity_resolution_suggestions ers
      JOIN projects p ON p.id = ers.project_id
      WHERE ers.id = entity_resolution_signals.suggestion_id
        AND p.user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE entity_resolution_suggestions IS
'Stores potential entity consolidations with scores 70-99 (medium confidence).
These are presented to users for review rather than automatically merged.
Tracks the decision (approved/rejected) and completion status.';

COMMENT ON COLUMN entity_resolution_suggestions.score IS
'Consolidation evidence score (70-99). 
70-79: weak to medium signals
80-89: strong signals
90-99: very strong signals (but still requires user confirmation)
100+: auto-merge (not stored here)';

COMMENT ON COLUMN entity_resolution_suggestions.review_status IS
'pending: awaiting user review
approved: user confirmed merge (but may not be implemented yet)
rejected: user chose to keep entities separate
implemented: merge has been applied to the knowledge base';

COMMENT ON COLUMN entity_resolution_suggestions.proposed_canonical_name IS
'If approved, which name should become the canonical name after merge.
Typically the longer name, but user can override.
NULL means the system will decide (usually longer name wins).';

COMMENT ON TABLE entity_resolution_signals IS
'Breaks down WHY a consolidation is suggested.
Each signal contributes points to the overall score.
Helps users understand and evaluate the suggestion.';
