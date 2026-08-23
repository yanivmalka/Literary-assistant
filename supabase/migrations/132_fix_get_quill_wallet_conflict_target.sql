-- ============================================
-- Fix get_quill_wallet() user_id ambiguity
-- The RETURNS TABLE user_id output variable must not be
-- referenced through an unqualified ON CONFLICT target.
-- ============================================

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
  ON CONFLICT ON CONSTRAINT user_quill_wallets_pkey DO NOTHING;

  RETURN QUERY
  SELECT wallet.user_id AS user_id,
         wallet.quills_balance AS quills_balance,
         wallet.token_remainder AS token_remainder
  FROM public.user_quill_wallets AS wallet
  WHERE wallet.user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quill_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quill_wallet() TO authenticated;

NOTIFY pgrst, 'reload schema';
