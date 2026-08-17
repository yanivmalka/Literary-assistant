-- ============================================
-- Row Level Security Policies for Document Analysis Tables
-- Run this in the Supabase SQL Editor AFTER 004_document_analysis_schema.sql
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_field_sources ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DOCUMENTS POLICIES (direct user_id)
-- ============================================
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- DOCUMENT VERSIONS POLICIES (via documents.user_id)
-- ============================================
CREATE POLICY "Users can view their document versions"
  ON document_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can create document versions"
  ON document_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their document versions"
  ON document_versions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their document versions"
  ON document_versions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
      AND documents.user_id = auth.uid()
  ));

-- ============================================
-- DOCUMENT CHUNKS POLICIES (via version → document → user_id)
-- ============================================
CREATE POLICY "Users can view their document chunks"
  ON document_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE dv.id = document_chunks.version_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can create document chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE dv.id = document_chunks.version_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their document chunks"
  ON document_chunks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE dv.id = document_chunks.version_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their document chunks"
  ON document_chunks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE dv.id = document_chunks.version_id
      AND d.user_id = auth.uid()
  ));

-- ============================================
-- CHUNK EMBEDDINGS POLICIES (via chunk → version → document → user_id)
-- ============================================
CREATE POLICY "Users can view their chunk embeddings"
  ON chunk_embeddings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM document_chunks dc
    JOIN document_versions dv ON dv.id = dc.version_id
    JOIN documents d ON d.id = dv.document_id
    WHERE dc.id = chunk_embeddings.chunk_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can create chunk embeddings"
  ON chunk_embeddings FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM document_chunks dc
    JOIN document_versions dv ON dv.id = dc.version_id
    JOIN documents d ON d.id = dv.document_id
    WHERE dc.id = chunk_embeddings.chunk_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their chunk embeddings"
  ON chunk_embeddings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM document_chunks dc
    JOIN document_versions dv ON dv.id = dc.version_id
    JOIN documents d ON d.id = dv.document_id
    WHERE dc.id = chunk_embeddings.chunk_id
      AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their chunk embeddings"
  ON chunk_embeddings FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM document_chunks dc
    JOIN document_versions dv ON dv.id = dc.version_id
    JOIN documents d ON d.id = dv.document_id
    WHERE dc.id = chunk_embeddings.chunk_id
      AND d.user_id = auth.uid()
  ));

-- ============================================
-- ENTITIES POLICIES (direct user_id)
-- ============================================
CREATE POLICY "Users can view their own entities"
  ON entities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own entities"
  ON entities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entities"
  ON entities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own entities"
  ON entities FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ENTITY MENTIONS POLICIES (via entities.user_id)
-- ============================================
CREATE POLICY "Users can view their entity mentions"
  ON entity_mentions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_mentions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can create entity mentions"
  ON entity_mentions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_mentions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their entity mentions"
  ON entity_mentions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_mentions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their entity mentions"
  ON entity_mentions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_mentions.entity_id
      AND entities.user_id = auth.uid()
  ));

-- ============================================
-- ENTITY RELATIONS POLICIES (via source entity user_id)
-- ============================================
CREATE POLICY "Users can view their entity relations"
  ON entity_relations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_relations.source_entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can create entity relations"
  ON entity_relations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_relations.source_entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their entity relations"
  ON entity_relations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_relations.source_entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their entity relations"
  ON entity_relations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_relations.source_entity_id
      AND entities.user_id = auth.uid()
  ));

-- ============================================
-- ENTITY ATTRIBUTES POLICIES (via entities.user_id)
-- ============================================
CREATE POLICY "Users can view their entity attributes"
  ON entity_attributes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_attributes.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can create entity attributes"
  ON entity_attributes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_attributes.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their entity attributes"
  ON entity_attributes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_attributes.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their entity attributes"
  ON entity_attributes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = entity_attributes.entity_id
      AND entities.user_id = auth.uid()
  ));

-- ============================================
-- CONTRADICTIONS POLICIES (via entities.user_id)
-- ============================================
CREATE POLICY "Users can view their contradictions"
  ON contradictions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = contradictions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can create contradictions"
  ON contradictions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = contradictions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their contradictions"
  ON contradictions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = contradictions.entity_id
      AND entities.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their contradictions"
  ON contradictions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM entities
    WHERE entities.id = contradictions.entity_id
      AND entities.user_id = auth.uid()
  ));

-- ============================================
-- PROFILES BASE POLICIES (direct user_id)
-- ============================================
CREATE POLICY "Users can view their own profiles"
  ON profiles_base FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profiles"
  ON profiles_base FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profiles"
  ON profiles_base FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profiles"
  ON profiles_base FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- PROFILE FIELD SOURCES POLICIES (via profiles_base.user_id)
-- ============================================
CREATE POLICY "Users can view their profile field sources"
  ON profile_field_sources FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles_base
    WHERE profiles_base.id = profile_field_sources.profile_id
      AND profiles_base.user_id = auth.uid()
  ));

CREATE POLICY "Users can create profile field sources"
  ON profile_field_sources FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles_base
    WHERE profiles_base.id = profile_field_sources.profile_id
      AND profiles_base.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their profile field sources"
  ON profile_field_sources FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles_base
    WHERE profiles_base.id = profile_field_sources.profile_id
      AND profiles_base.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their profile field sources"
  ON profile_field_sources FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles_base
    WHERE profiles_base.id = profile_field_sources.profile_id
      AND profiles_base.user_id = auth.uid()
  ));
