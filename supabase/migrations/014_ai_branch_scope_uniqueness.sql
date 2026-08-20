-- Task 4: keep branch-scoped AI evidence independent from Main and other branches.
-- Existing legacy rows keep branch_id IS NULL. New AI rows always carry a branch_id.

-- Replace legacy unique constraints that would otherwise make Branch 2 collide
-- with Branch 1 (or force an upsert to mutate a Main-scoped row).
ALTER TABLE IF EXISTS knowledge_entity_aliases
  DROP CONSTRAINT IF EXISTS knowledge_entity_aliases_entity_id_alias_key;

ALTER TABLE IF EXISTS knowledge_entity_mentions
  DROP CONSTRAINT IF EXISTS knowledge_entity_mentions_entity_id_chunk_position_evidence_key;

ALTER TABLE IF EXISTS knowledge_entity_relationships
  DROP CONSTRAINT IF EXISTS knowledge_entity_relationships_version_id_source_entity_id_target_entity_id_relationship_type_key;

ALTER TABLE IF EXISTS knowledge_events
  DROP CONSTRAINT IF EXISTS knowledge_events_version_id_name_key;

ALTER TABLE IF EXISTS knowledge_event_mentions
  DROP CONSTRAINT IF EXISTS knowledge_event_mentions_event_id_chunk_position_evidence_key;

-- Include branch_id in every extraction uniqueness key. PostgreSQL permits multiple
-- NULL branch_id values, so legacy rows remain compatible while Branch rows are
-- isolated and can safely use ON CONFLICT (..., branch_id).
DROP INDEX IF EXISTS uq_entity_aliases_main_scope;
DROP INDEX IF EXISTS uq_entity_aliases_branch_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_branch_scope
  ON knowledge_entity_aliases(entity_id, alias, branch_id);

DROP INDEX IF EXISTS uq_entity_mentions_main_scope;
DROP INDEX IF EXISTS uq_entity_mentions_branch_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_mentions_branch_scope
  ON knowledge_entity_mentions(entity_id, chunk_position, evidence, branch_id);

DROP INDEX IF EXISTS uq_entity_relationships_main_scope;
DROP INDEX IF EXISTS uq_entity_relationships_branch_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_relationships_branch_scope
  ON knowledge_entity_relationships(version_id, source_entity_id, target_entity_id, relationship_type, branch_id);

DROP INDEX IF EXISTS uq_events_main_scope;
DROP INDEX IF EXISTS uq_events_branch_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_branch_scope
  ON knowledge_events(version_id, name, branch_id);

DROP INDEX IF EXISTS uq_event_mentions_main_scope;
DROP INDEX IF EXISTS uq_event_mentions_branch_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_mentions_branch_scope
  ON knowledge_event_mentions(event_id, chunk_position, evidence, branch_id);

COMMENT ON INDEX uq_entity_aliases_branch_scope IS
  'AI aliases are isolated by branch and cannot overwrite Main or another Branch.';
COMMENT ON INDEX uq_entity_mentions_branch_scope IS
  'AI evidence mentions are isolated by branch and cannot overwrite Main or another Branch.';
