-- ============================================
-- Search Functions for Document Analysis
-- Provides semantic (pgvector) and full-text search scoped to projects.
-- Run AFTER 004_document_analysis_schema.sql
-- ============================================

-- ============================================
-- SEMANTIC SEARCH FUNCTION
-- Uses pgvector cosine similarity, scoped to a project.
-- ============================================
CREATE OR REPLACE FUNCTION search_chunks_semantic(
  query_embedding text,
  match_project_id UUID,
  match_model_name TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT,
  chapter_number INT,
  chapter_title TEXT,
  page INT,
  "position" INT,
  version_id UUID,
  document_id UUID,
  document_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.content,
    1 - (ce.embedding <=> query_embedding::vector) AS similarity,
    dc.chapter_number,
    dc.chapter_title,
    dc.page,
    dc."position",
    dc.version_id,
    d.id AS document_id,
    d.name AS document_name
  FROM chunk_embeddings ce
  JOIN document_chunks dc ON dc.id = ce.chunk_id
  JOIN document_versions dv ON dv.id = dc.version_id
  JOIN documents d ON d.id = dv.document_id
  WHERE d.project_id = match_project_id
    AND ce.model_name = match_model_name
    AND ce.is_stale = false
  ORDER BY ce.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- ============================================
-- FULL-TEXT SEARCH FUNCTION
-- Uses PostgreSQL tsvector with 'simple' config (language-agnostic, works for Hebrew).
-- ============================================
CREATE OR REPLACE FUNCTION search_chunks_fulltext(
  search_query TEXT,
  match_project_id UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  rank FLOAT,
  chapter_number INT,
  chapter_title TEXT,
  page INT,
  "position" INT,
  version_id UUID,
  document_id UUID,
  document_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.content,
    ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', search_query))::FLOAT AS rank,
    dc.chapter_number,
    dc.chapter_title,
    dc.page,
    dc."position",
    dc.version_id,
    d.id AS document_id,
    d.name AS document_name
  FROM document_chunks dc
  JOIN document_versions dv ON dv.id = dc.version_id
  JOIN documents d ON d.id = dv.document_id
  WHERE d.project_id = match_project_id
    AND to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;
