-- ============================================
-- EXTRACTION PROMOTION CONTRACT
-- Records explicit, reviewable transfers between isolated profiles.
-- No automatic data copy is performed by this migration.
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source_extraction_run_id TEXT NOT NULL,
  source_branch_id UUID NOT NULL REFERENCES knowledge_branches(id) ON DELETE RESTRICT,
  source_profile TEXT NOT NULL CHECK (source_profile IN ('current', 'development')),
  target_profile TEXT NOT NULL CHECK (target_profile IN ('current', 'development')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'conflict')),
  conflict_count INTEGER NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT extraction_promotions_different_profiles
    CHECK (source_profile <> target_profile),
  UNIQUE (project_id, source_extraction_run_id, target_profile)
);

CREATE INDEX IF NOT EXISTS idx_extraction_promotions_source
  ON extraction_promotions(project_id, source_branch_id, source_extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_extraction_promotions_status
  ON extraction_promotions(project_id, status);

CREATE TABLE IF NOT EXISTS extraction_promotion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES extraction_promotions(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES knowledge_entities(id) ON DELETE SET NULL,
  selected_fields JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'conflict')),
  conflict_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, source_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_promotion_items_promotion
  ON extraction_promotion_items(promotion_id, status);

ALTER TABLE extraction_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_promotion_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extraction_promotions' AND policyname = 'Users can view own extraction promotions'
  ) THEN
    CREATE POLICY "Users can view own extraction promotions"
      ON extraction_promotions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extraction_promotions' AND policyname = 'Users can create own extraction promotions'
  ) THEN
    CREATE POLICY "Users can create own extraction promotions"
      ON extraction_promotions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extraction_promotion_items' AND policyname = 'Users can view own promotion items'
  ) THEN
    CREATE POLICY "Users can view own promotion items"
      ON extraction_promotion_items FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM extraction_promotions promotions
          WHERE promotions.id = promotion_id AND promotions.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extraction_promotion_items' AND policyname = 'Users can create own promotion items'
  ) THEN
    CREATE POLICY "Users can create own promotion items"
      ON extraction_promotion_items FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM extraction_promotions promotions
          WHERE promotions.id = promotion_id AND promotions.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_extraction_promotion()
RETURNS TRIGGER AS $$
DECLARE
  source_branch RECORD;
BEGIN
  SELECT project_id, user_id, profile
  INTO source_branch
  FROM knowledge_branches
  WHERE id = NEW.source_branch_id;

  IF NOT FOUND
    OR source_branch.project_id <> NEW.project_id
    OR source_branch.user_id <> NEW.user_id
    OR source_branch.profile <> NEW.source_profile THEN
    RAISE EXCEPTION 'Promotion source branch does not match project, user, or source profile';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM raw_extractions
    WHERE project_id = NEW.project_id
      AND user_id = NEW.user_id
      AND extraction_run_id = NEW.source_extraction_run_id
      AND model_profile = NEW.source_profile
      AND branch_id = NEW.source_branch_id
  ) THEN
    RAISE EXCEPTION 'Promotion source extraction run was not found on the source branch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_extraction_promotion ON extraction_promotions;
CREATE TRIGGER trg_validate_extraction_promotion
  BEFORE INSERT OR UPDATE ON extraction_promotions
  FOR EACH ROW
  EXECUTE FUNCTION validate_extraction_promotion();

CREATE OR REPLACE FUNCTION validate_extraction_promotion_item()
RETURNS TRIGGER AS $$
DECLARE
  promotion RECORD;
  source_entity RECORD;
BEGIN
  SELECT project_id, user_id, source_branch_id
  INTO promotion
  FROM extraction_promotions
  WHERE id = NEW.promotion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion request was not found';
  END IF;

  SELECT project_id, user_id, branch_id
  INTO source_entity
  FROM knowledge_entities
  WHERE id = NEW.source_entity_id;

  IF NOT FOUND
    OR source_entity.project_id <> promotion.project_id
    OR source_entity.user_id <> promotion.user_id
    OR source_entity.branch_id <> promotion.source_branch_id THEN
    RAISE EXCEPTION 'Promotion item source entity does not belong to the promotion source branch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_extraction_promotion_item ON extraction_promotion_items;
CREATE TRIGGER trg_validate_extraction_promotion_item
  BEFORE INSERT OR UPDATE ON extraction_promotion_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_extraction_promotion_item();

COMMENT ON TABLE extraction_promotions IS
'Explicit audit record for transferring reviewed extraction results between isolated profiles.';
COMMENT ON TABLE extraction_promotion_items IS
'Field/entity selection for a promotion. Applying items requires a future server-side transaction with conflict checks.';
