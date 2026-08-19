-- ============================================
-- KNOWLEDGE ENTITIES SCHEMA
-- Structured entity extraction from documents using Gemini.
-- Layer system: 'main' = production, branch = working copy
-- Source tracking: 'ai' (extracted) vs 'user' (manually created)
-- ============================================

-- ============================================
-- RAW EXTRACTIONS TABLE
-- Store the raw Gemini API responses for audit/replay
-- ============================================
CREATE TABLE IF NOT EXISTS raw_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  model TEXT NOT NULL,                      -- e.g. 'gemini-2.0-flash'
  raw_response JSONB NOT NULL,              -- full Gemini extraction response
  input_tokens INT,
  output_tokens INT,
  thinking_tokens INT,
  total_tokens INT,
  cached_tokens INT,
  latency_ms INT,
  chunks_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_extractions_project ON raw_extractions(project_id);
CREATE INDEX idx_raw_extractions_document ON raw_extractions(document_id);
CREATE INDEX idx_raw_extractions_version ON raw_extractions(version_id);
CREATE INDEX idx_raw_extractions_user ON raw_extractions(user_id);
CREATE INDEX idx_raw_extractions_model ON raw_extractions(model);

-- ============================================
-- KNOWLEDGE ENTITIES TABLE
-- Main knowledge layer: canonical entities extracted from documents
-- Using Gemini + multi-model fallback.
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
  
  -- Entity identity
  canonical_name TEXT NOT NULL,             -- Primary display name (no nikud)
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'character', 'location', 'object', 'ability', 'magic_ability', 'organization', 'event'
  )),
  entity_types TEXT[] DEFAULT '{}',         -- Can be multiple types
  
  -- Data fields
  description TEXT,
  attributes JSONB DEFAULT '{}',            -- Flexible attributes (abilities, relationships, etc.)
  structured_fields JSONB DEFAULT '{}',    -- Typed fields per entity type (age, height, eye_color, etc.)
  
  -- Layer system
  layer TEXT NOT NULL DEFAULT 'main' CHECK (layer IN ('main', 'branch')),
  
  -- Source tracking (CRITICAL: prevents AI from overwriting user data)
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user')),
  
  -- Extraction audit
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_entities_project ON knowledge_entities(project_id);
CREATE INDEX idx_knowledge_entities_user ON knowledge_entities(user_id);
CREATE INDEX idx_knowledge_entities_document ON knowledge_entities(document_id);
CREATE INDEX idx_knowledge_entities_type ON knowledge_entities(entity_type);
CREATE INDEX idx_knowledge_entities_layer ON knowledge_entities(layer);
CREATE INDEX idx_knowledge_entities_source ON knowledge_entities(source);
CREATE INDEX idx_knowledge_entities_canonical ON knowledge_entities(canonical_name);
CREATE INDEX idx_knowledge_entities_project_user_layer ON knowledge_entities(project_id, user_id, layer);

-- ============================================
-- ENTITY ALIASES TABLE
-- Alternative names for the same entity
-- Example: "ליאו" is an alias for "ליאו פרוסט"
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(entity_id, alias)
);

CREATE INDEX idx_entity_aliases_entity ON knowledge_entity_aliases(entity_id);
CREATE INDEX idx_entity_aliases_text ON knowledge_entity_aliases(alias);

-- ============================================
-- ENTITY MENTIONS TABLE
-- Tracks where entities appear in document chunks
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_entity_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  chunk_position INT NOT NULL,              -- Position in document
  evidence TEXT,                            -- Text snippet showing the mention (max ~500 chars)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(entity_id, chunk_position, evidence)
);

CREATE INDEX idx_entity_mentions_entity ON knowledge_entity_mentions(entity_id);
CREATE INDEX idx_entity_mentions_chunk ON knowledge_entity_mentions(chunk_position);

-- ============================================
-- ENTITY RELATIONSHIPS TABLE
-- Relationships between entities
-- Example: character A -> located_in -> location B
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_entity_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
  
  source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,          -- e.g. 'knows', 'located_in', 'owns', 'uses'
  
  evidence TEXT,                            -- Snippet supporting the relationship
  chunk_position INT,                       -- Where mentioned in document
  
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(version_id, source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX idx_entity_relationships_source ON knowledge_entity_relationships(source_entity_id);
CREATE INDEX idx_entity_relationships_target ON knowledge_entity_relationships(target_entity_id);
CREATE INDEX idx_entity_relationships_type ON knowledge_entity_relationships(relationship_type);
CREATE INDEX idx_entity_relationships_project ON knowledge_entity_relationships(project_id);

-- ============================================
-- EVENTS TABLE
-- Events extracted from documents
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  version_id UUID REFERENCES document_versions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  attributes JSONB DEFAULT '{}',            -- location, participants, etc.
  
  raw_extraction_id UUID REFERENCES raw_extractions(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_project ON knowledge_events(project_id);
CREATE INDEX idx_events_document ON knowledge_events(document_id);
CREATE INDEX idx_events_version ON knowledge_events(version_id);
CREATE INDEX idx_events_user ON knowledge_events(user_id);

-- ============================================
-- EVENT MENTIONS TABLE
-- Where events are mentioned in document chunks
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_event_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES knowledge_events(id) ON DELETE CASCADE,
  chunk_position INT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(event_id, chunk_position, evidence)
);

CREATE INDEX idx_event_mentions_event ON knowledge_event_mentions(event_id);

-- ============================================
-- EVENT PARTICIPANTS TABLE
-- Links characters/entities to events
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_event_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES knowledge_events(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  role TEXT,                                -- e.g. 'protagonist', 'antagonist', 'witness'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(event_id, entity_id)
);

CREATE INDEX idx_event_participants_event ON knowledge_event_participants(event_id);
CREATE INDEX idx_event_participants_entity ON knowledge_event_participants(entity_id);

-- ============================================
-- TRIGGER: update_updated_at for knowledge tables
-- ============================================
CREATE TRIGGER knowledge_entities_updated_at
  BEFORE UPDATE ON knowledge_entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER knowledge_events_updated_at
  BEFORE UPDATE ON knowledge_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

