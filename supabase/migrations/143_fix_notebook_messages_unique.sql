-- Fix Notebook message persistence: the ON CONFLICT target used by
-- upsertMessage() (supabase/functions/_shared/notebook-persistence.ts)
-- is the plain column list (conversation_id, role, client_request_id).
-- Postgres cannot use a PARTIAL unique index as the arbiter for a plain
-- ON CONFLICT clause unless the clause repeats the index's WHERE predicate,
-- which supabase-js's upsert({ onConflict }) has no way to express. As a
-- result, every notebook_messages upsert has been failing with 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"), silently swallowed by persistNotebookTurnSafely(), so
-- no Notebook conversation has ever actually persisted a message.
--
-- Replace the partial index with a true, non-partial UNIQUE constraint on
-- the same columns so the existing ON CONFLICT target resolves correctly.
-- A plain UNIQUE constraint treats each NULL client_request_id as distinct,
-- so this is not more restrictive than the partial index it replaces.
-- ============================================

DROP INDEX IF EXISTS public.idx_notebook_messages_request;

ALTER TABLE public.notebook_messages
  ADD CONSTRAINT notebook_messages_conversation_role_request_key
  UNIQUE (conversation_id, role, client_request_id);
