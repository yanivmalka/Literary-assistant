-- Fix get_quill_wallet() ambiguity between the RETURNS TABLE user_id
-- output variable and the user_quill_wallets.user_id column.

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.user_quill_wallets (user_id)
  VALUES (auth.uid())
  ON CONFLICT ON CONSTRAINT user_quill_wallets_pkey DO NOTHING;

  RETURN QUERY
  SELECT wallet.user_id, wallet.quills_balance, wallet.token_remainder
  FROM public.user_quill_wallets AS wallet
  WHERE wallet.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quill_wallet() TO authenticated;
NOTIFY pgrst, 'reload schema';
