-- ============================================
-- Document Analysis & Knowledge Base Schema
-- Run this in the Supabase SQL Editor AFTER 003_storage_and_cleanup.sql
-- ============================================

-- Enable pgvector for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- DOCUMENTS TABLE
-- A logical document (book, chapter, draft) within a project.
-- A project can have multiple documents.
-- ============================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);

-- ============================================
-- DOCUMENT VERSIONS TABLE
-- Each upload creates a new version. Never overwrites previous versions.
-- Preserves full history: Project → Document → Version → Chunks → Embeddings
-- ============================================
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  storage_path TEXT NOT NULL,
  file_size INT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded',
    'extracting',
    'extracted',
    'chunking',
    'chunked',
    'indexing',
    'indexed',
    'analyzing',
    'ready',
    'error',
    'skipped_no_provider'
  )),
  error_message TEXT,
  error_stage TEXT CHECK (error_stage IN (
    'extraction', 'chunking', 'indexing', 'entity_extraction',
    'attribute_extraction', 'contradiction_detection', NULL
  )),
  structure_metadata JSONB DEFAULT '{}',  -- chapter count, page count, detected language, etc.
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, version_number)
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_status ON document_versions(status);

-- ============================================
-- DOCUMENT CHUNKS TABLE
-- Extracted text segments with rich positional metadata.
-- Original text is preserved exactly as extracted (Hebrew, English, mixed).
-- ============================================
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  chapter_number INT,
  chapter_title TEXT,
  page INT,                      -- page number if available from extraction
  "position" INT NOT NULL,       -- sequential position within the document version
  scene_break BOOLEAN DEFAULT FALSE,
  content TEXT NOT NULL,         -- original text, preserved exactly
  token_count INT,
  metadata JSONB DEFAULT '{}',   -- paragraph_index, heading_level, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_version_id ON document_chunks(version_id);
CREATE INDEX idx_chunks_version_position ON document_chunks(version_id, "position");
CREATE INDEX idx_chunks_chapter ON document_chunks(version_id, chapter_number);

-- Full-text search index using 'simple' config (language-agnostic, works for Hebrew)
CREATE INDEX idx_chunks_content_fts ON document_chunks
  USING GIN (to_tsvector('simple', content));

-- ============================================
-- CHUNK EMBEDDINGS TABLE
-- Vectors stored at NATIVE dimensions — no padding.
-- model_name + dimensions stored per row for staleness detection.
-- When embedding model changes, old rows are marked stale.
-- ============================================
-- Note: pgvector requires a fixed dimension for the vector column type.
-- We use vector(384) as the default for the MVP local model.
-- If switching to a model with different dimensions, a migration will
-- alter the column type or create a new column. The is_stale flag
-- allows the system to detect and regenerate outdated embeddings.
CREATE TABLE chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,        -- e.g. 'Xenova/all-MiniLM-L6-v2'
  dimensions INT NOT NULL,         -- e.g. 384 — actual dimension, no padding
  embedding vector(384) NOT NULL,  -- native dimension for default model
  is_stale BOOLEAN DEFAULT FALSE,  -- marked true when model config changes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);
CREATE INDEX idx_chunk_embeddings_stale ON chunk_embeddings(is_stale) WHERE is_stale = true;

-- Vector similarity search index — will be created after first data is inserted
-- CREATE INDEX idx_chunk_embeddings_vector ON chunk_embeddings
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- ENTITIES TABLE
-- Things detected in documents (characters, locations, etc.)
-- Entity is the DETECTION layer — separate from Profile (user-managed).
-- ============================================
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'character', 'location', 'country', 'continent', 'region',
    'object', 'ability', 'magic_system', 'event'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'dismissed', 'merged'
  )),
  aliases TEXT[] DEFAULT '{}',
  merged_into_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_project_id ON entities(project_id);
CREATE INDEX idx_entities_user_id ON entities(user_id);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_status ON entities(status);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_merged_into ON entities(merged_into_id) WHERE merged_into_id IS NOT NULL;

-- ============================================
-- ENTITY MENTIONS TABLE
-- Where in the text an entity appears.
-- Every mention is traceable: mention → chunk → version → document → project
-- ============================================
CREATE TABLE entity_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  context_snippet TEXT NOT NULL,    -- surrounding text (~200 chars) for UI display
  mention_text TEXT NOT NULL,       -- the exact matched text
  position_start INT,              -- character position within chunk
  position_end INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_mentions_entity_id ON entity_mentions(entity_id);
CREATE INDEX idx_entity_mentions_chunk_id ON entity_mentions(chunk_id);

-- ============================================
-- ENTITY RELATIONS TABLE
-- Relationships between entities (located_in, uses, knows, etc.)
-- ============================================
CREATE TABLE entity_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,    -- located_in, uses, belongs_to, part_of, knows, etc.
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  confidence FLOAT DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_relations_source ON entity_relations(source_entity_id);
CREATE INDEX idx_entity_relations_target ON entity_relations(target_entity_id);
CREATE INDEX idx_entity_relations_type ON entity_relations(relation_type);

-- ============================================
-- ENTITY ATTRIBUTES TABLE
-- Properties of entities extracted from text.
-- Each attribute retains source_chunk_id for traceability.
-- data_origin distinguishes AI-extracted vs user-defined data.
-- ============================================
CREATE TABLE entity_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  attribute_name TEXT NOT NULL,     -- e.g. 'eye_color', 'height', 'climate'
  attribute_value TEXT NOT NULL,    -- e.g. 'blue', '180cm', 'arid'
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  confidence FLOAT DEFAULT 1.0,
  data_origin TEXT NOT NULL DEFAULT 'ai_extracted' CHECK (data_origin IN (
    'ai_extracted',      -- AI found this in the document
    'user_confirmed',    -- user confirmed an AI extraction
    'user_defined'       -- user added manually
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_attributes_entity_id ON entity_attributes(entity_id);
CREATE INDEX idx_entity_attributes_name ON entity_attributes(entity_id, attribute_name);

-- ============================================
-- CONTRADICTIONS TABLE
-- Potential inconsistencies found in text.
-- MVP: attribute_conflict. Architecture supports future types.
-- ============================================
CREATE TABLE contradictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  attribute_a_id UUID REFERENCES entity_attributes(id) ON DELETE CASCADE,
  attribute_b_id UUID REFERENCES entity_attributes(id) ON DELETE CASCADE,
  contradiction_type TEXT NOT NULL DEFAULT 'attribute_conflict' CHECK (contradiction_type IN (
    'attribute_conflict',     -- different values for same attribute (MVP)
    'logical_conflict',       -- future: contradicting facts
    'temporal_conflict',      -- future: timeline issues
    'relationship_conflict'   -- future: relationship inconsistencies
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'resolved_fix_profile',
    'resolved_fix_text',
    'resolved_intentional',
    'ignored'
  )),
  description TEXT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_contradictions_entity_id ON contradictions(entity_id);
CREATE INDEX idx_contradictions_status ON contradictions(status);

-- ============================================
-- PROFILES BASE TABLE
-- User-managed structured information about entities.
-- SEPARATE from Entity (detection layer).
-- A profile may exist without a linked entity (user-created manually).
-- An entity may exist without a profile (not yet promoted).
-- ============================================
CREATE TABLE profiles_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,  -- optional link
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_type TEXT NOT NULL CHECK (profile_type IN (
    'character', 'environment', 'ability', 'object'
  )),
  profile_data JSONB NOT NULL DEFAULT '{}',  -- structured profile fields
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_base_project_id ON profiles_base(project_id);
CREATE INDEX idx_profiles_base_entity_id ON profiles_base(entity_id);
CREATE INDEX idx_profiles_base_type ON profiles_base(profile_type);
CREATE INDEX idx_profiles_base_user_id ON profiles_base(user_id);

-- ============================================
-- PROFILE FIELD SOURCES TABLE
-- Tracks the origin of each profile field value.
-- Prevents AI from silently overwriting user edits.
-- ============================================
CREATE TABLE profile_field_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles_base(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,         -- e.g. 'eyes', 'hair_color', 'climate'
  source_type TEXT NOT NULL CHECK (source_type IN (
    'document_extracted',   -- came from document analysis
    'user_defined',         -- user typed it manually
    'user_edited'           -- was extracted, then user modified it — NEVER overwrite
  )),
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  last_modified_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(profile_id, field_path)
);

CREATE INDEX idx_profile_field_sources_profile_id ON profile_field_sources(profile_id);

-- ============================================
-- TRIGGERS — updated_at auto-update
-- Uses the existing update_updated_at() function from migration 001
-- ============================================
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_base_updated_at
  BEFORE UPDATE ON profiles_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
