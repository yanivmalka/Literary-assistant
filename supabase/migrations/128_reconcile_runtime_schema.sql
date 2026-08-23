-- Reconcile runtime schema drift without deleting application data.
--
-- The repository's migration 110 intentionally removed canonical-name
-- uniqueness because canonical_name is a display attribute. Some deployed
-- environments still have the older version-name constraint. Remove only
-- that stale constraint/index so repeated extraction can be handled by the
-- application merge logic instead of failing at the database boundary.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.knowledge_entities'::regclass
      AND conname = 'knowledge_entities_version_name_unique'
  ) THEN
    ALTER TABLE public.knowledge_entities
      DROP CONSTRAINT knowledge_entities_version_name_unique;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.knowledge_entities_version_name_unique;

-- Keep the RPC definition unambiguous even when an older function body is
-- still present in the deployed database. Every table column is qualified.
CREATE OR REPLACE FUNCTION public.get_quill_wallet()
RETURNS TABLE (
  user_id UUID,
  quills_balance INTEGER,
  token_remainder INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.user_quill_wallets (user_id)
  VALUES (current_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT wallet.user_id AS user_id,
         wallet.quills_balance AS quills_balance,
         wallet.token_remainder AS token_remainder
  FROM public.user_quill_wallets AS wallet
  WHERE wallet.user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quill_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quill_wallet() TO authenticated;

NOTIFY pgrst, 'reload schema';
