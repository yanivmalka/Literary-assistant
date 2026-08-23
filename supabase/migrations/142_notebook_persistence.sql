-- Additive Notebook persistence for source-grounded QA.
-- This migration does not alter documents, extraction, Main, or Branch data.
-- Notebook rows are review/history data and can be removed independently.
-- ============================================

CREATE TABLE IF NOT EXISTS public.notebook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'document_version'
    CHECK (source_type = 'document_version'),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_sources_project
  ON public.notebook_sources(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_sources_version
  ON public.notebook_sources(version_id);

CREATE TABLE IF NOT EXISTS public.notebook_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Notebook conversation',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_conversations_project
  ON public.notebook_conversations(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_conversations_user
  ON public.notebook_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.notebook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.notebook_conversations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  client_request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_messages_conversation
  ON public.notebook_messages(conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_notebook_messages_project
  ON public.notebook_messages(project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_messages_request
  ON public.notebook_messages(conversation_id, role, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notebook_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.notebook_messages(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.notebook_sources(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  citation_index INTEGER NOT NULL CHECK (citation_index >= 0),
  quote TEXT NOT NULL CHECK (char_length(quote) <= 4000),
  page INTEGER,
  chapter_number INTEGER,
  chapter_title TEXT,
  chunk_position INTEGER,
  retrieval_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, citation_index)
);

CREATE INDEX IF NOT EXISTS idx_notebook_citations_message
  ON public.notebook_citations(message_id, citation_index);
CREATE INDEX IF NOT EXISTS idx_notebook_citations_source
  ON public.notebook_citations(source_id);

-- Keep denormalized ownership/project columns consistent. These checks are
-- intentionally database-side because service-role Edge Functions bypass RLS.
CREATE OR REPLACE FUNCTION public.validate_notebook_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  document_project UUID;
  document_user UUID;
  version_document UUID;
BEGIN
  SELECT d.project_id, d.user_id
    INTO document_project, document_user
  FROM public.documents d
  WHERE d.id = NEW.document_id;

  IF document_project IS NULL
    OR document_project <> NEW.project_id
    OR document_user <> NEW.user_id THEN
    RAISE EXCEPTION 'Notebook source document ownership mismatch';
  END IF;

  SELECT dv.document_id
    INTO version_document
  FROM public.document_versions dv
  WHERE dv.id = NEW.version_id;

  IF version_document IS NULL OR version_document <> NEW.document_id THEN
    RAISE EXCEPTION 'Notebook source version does not belong to document';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_notebook_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  project_user UUID;
BEGIN
  SELECT p.user_id
    INTO project_user
  FROM public.projects p
  WHERE p.id = NEW.project_id
    AND p.deleted_at IS NULL;

  IF project_user IS NULL OR project_user <> NEW.user_id THEN
    RAISE EXCEPTION 'Notebook conversation project ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_notebook_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conversation_project UUID;
  conversation_user UUID;
BEGIN
  SELECT c.project_id, c.user_id
    INTO conversation_project, conversation_user
  FROM public.notebook_conversations c
  WHERE c.id = NEW.conversation_id;

  IF conversation_project IS NULL
    OR conversation_project <> NEW.project_id
    OR conversation_user <> NEW.user_id THEN
    RAISE EXCEPTION 'Notebook message conversation ownership mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_notebook_citation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  message_project UUID;
  message_user UUID;
  source_project UUID;
  source_user UUID;
  source_version UUID;
  chunk_version UUID;
BEGIN
  SELECT m.project_id, m.user_id
    INTO message_project, message_user
  FROM public.notebook_messages m
  WHERE m.id = NEW.message_id;

  SELECT s.project_id, s.user_id, s.version_id
    INTO source_project, source_user, source_version
  FROM public.notebook_sources s
  WHERE s.id = NEW.source_id;

  IF message_project IS NULL
    OR source_project IS NULL
    OR message_project <> source_project
    OR message_user <> source_user THEN
    RAISE EXCEPTION 'Notebook citation message/source ownership mismatch';
  END IF;

  IF NEW.chunk_id IS NOT NULL THEN
    SELECT dc.version_id
      INTO chunk_version
    FROM public.document_chunks dc
    WHERE dc.id = NEW.chunk_id;

    IF chunk_version IS NULL OR chunk_version <> source_version THEN
      RAISE EXCEPTION 'Notebook citation chunk does not belong to source version';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_notebook_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_notebook_source ON public.notebook_sources;
CREATE TRIGGER trg_validate_notebook_source
  BEFORE INSERT OR UPDATE ON public.notebook_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_notebook_source();

DROP TRIGGER IF EXISTS trg_validate_notebook_conversation ON public.notebook_conversations;
CREATE TRIGGER trg_validate_notebook_conversation
  BEFORE INSERT OR UPDATE ON public.notebook_conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_notebook_conversation();

DROP TRIGGER IF EXISTS trg_validate_notebook_message ON public.notebook_messages;
CREATE TRIGGER trg_validate_notebook_message
  BEFORE INSERT OR UPDATE ON public.notebook_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_notebook_message();

DROP TRIGGER IF EXISTS trg_validate_notebook_citation ON public.notebook_citations;
CREATE TRIGGER trg_validate_notebook_citation
  BEFORE INSERT OR UPDATE ON public.notebook_citations
  FOR EACH ROW EXECUTE FUNCTION public.validate_notebook_citation();

DROP TRIGGER IF EXISTS trg_notebook_sources_updated_at ON public.notebook_sources;
CREATE TRIGGER trg_notebook_sources_updated_at
  BEFORE UPDATE ON public.notebook_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_notebook_updated_at();

DROP TRIGGER IF EXISTS trg_notebook_conversations_updated_at ON public.notebook_conversations;
CREATE TRIGGER trg_notebook_conversations_updated_at
  BEFORE UPDATE ON public.notebook_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_notebook_updated_at();

ALTER TABLE public.notebook_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_citations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read notebook sources" ON public.notebook_sources;
CREATE POLICY "Users can read notebook sources"
  ON public.notebook_sources FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read notebook conversations" ON public.notebook_conversations;
CREATE POLICY "Users can read notebook conversations"
  ON public.notebook_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update notebook conversations" ON public.notebook_conversations;
CREATE POLICY "Users can update notebook conversations"
  ON public.notebook_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete notebook conversations" ON public.notebook_conversations;
CREATE POLICY "Users can delete notebook conversations"
  ON public.notebook_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read notebook messages" ON public.notebook_messages;
CREATE POLICY "Users can read notebook messages"
  ON public.notebook_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read notebook citations" ON public.notebook_citations;
CREATE POLICY "Users can read notebook citations"
  ON public.notebook_citations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.notebook_messages m
    WHERE m.id = notebook_citations.message_id
      AND m.user_id = auth.uid()
  ));

COMMENT ON TABLE public.notebook_sources IS
  'Notebook references to project document versions. Content remains in document_chunks.';
COMMENT ON TABLE public.notebook_conversations IS
  'Persistent, user-owned Notebook conversations; independent from Main and Branch.';
COMMENT ON TABLE public.notebook_messages IS
  'Persistent Notebook turns. Assistant writes are produced by the QA Edge Function.';
COMMENT ON TABLE public.notebook_citations IS
  'Immutable-friendly citation snapshots linking Notebook messages to retrieved chunks.';
