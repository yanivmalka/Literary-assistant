-- ============================================
-- Quills quota and demo store
-- 5,000 Gemini tokens = 1 Quill
-- ============================================

CREATE TABLE IF NOT EXISTS user_quill_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quills_balance INTEGER NOT NULL DEFAULT 30 CHECK (quills_balance >= 0),
  token_remainder INTEGER NOT NULL DEFAULT 0 CHECK (token_remainder >= 0 AND token_remainder < 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quill_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('initial_grant', 'demo_purchase', 'consumption', 'refund')),
  source TEXT NOT NULL,
  quills_delta INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  token_remainder_after INTEGER NOT NULL CHECK (token_remainder_after >= 0 AND token_remainder_after < 5000),
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quill_ledger_user_created
  ON quill_ledger(user_id, created_at DESC);

ALTER TABLE user_quill_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE quill_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own Quill wallet" ON user_quill_wallets;
CREATE POLICY "Users can view their own Quill wallet"
  ON user_quill_wallets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own Quill ledger" ON quill_ledger;
CREATE POLICY "Users can view their own Quill ledger"
  ON quill_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION create_initial_quill_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_quill_wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO quill_ledger (
    user_id, transaction_type, source, quills_delta,
    balance_after, token_remainder_after, metadata
  )
  SELECT NEW.id, 'initial_grant', 'account_creation', 30,
         30, 0, jsonb_build_object('reason', 'welcome_quills')
  WHERE NOT EXISTS (
    SELECT 1 FROM quill_ledger
    WHERE user_id = NEW.id AND transaction_type = 'initial_grant'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_quill_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_quill_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_initial_quill_wallet();

-- Backfill users that existed before this migration.
INSERT INTO user_quill_wallets (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO quill_ledger (
  user_id, transaction_type, source, quills_delta,
  balance_after, token_remainder_after, metadata
)
SELECT u.id, 'initial_grant', 'account_creation', 30,
       30, 0, jsonb_build_object('reason', 'welcome_quills_backfill')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM quill_ledger l
  WHERE l.user_id = u.id AND l.transaction_type = 'initial_grant'
);

CREATE OR REPLACE FUNCTION update_quill_wallet_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_quill_wallets_updated_at ON user_quill_wallets;
CREATE TRIGGER user_quill_wallets_updated_at
  BEFORE UPDATE ON user_quill_wallets
  FOR EACH ROW EXECUTE FUNCTION update_quill_wallet_timestamp();

CREATE OR REPLACE FUNCTION get_quill_wallet()
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

  INSERT INTO user_quill_wallets (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT w.user_id, w.quills_balance, w.token_remainder
  FROM user_quill_wallets w
  WHERE w.user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION grant_demo_quills(p_amount INTEGER, p_package TEXT)
RETURNS TABLE (
  quills_balance INTEGER,
  token_remainder INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet user_quill_wallets%ROWTYPE;
  new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount NOT IN (20, 50, 100) OR p_package NOT IN ('20', '50', '100')
     OR p_amount::TEXT <> p_package THEN
    RAISE EXCEPTION 'Invalid Quill package';
  END IF;

  INSERT INTO user_quill_wallets (user_id)
  VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO wallet
  FROM user_quill_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  new_balance := wallet.quills_balance + p_amount;

  UPDATE user_quill_wallets
  SET quills_balance = new_balance
  WHERE user_id = auth.uid();

  INSERT INTO quill_ledger (
    user_id, transaction_type, source, quills_delta,
    balance_after, token_remainder_after, metadata
  ) VALUES (
    auth.uid(), 'demo_purchase', 'quill_store', p_amount,
    new_balance, wallet.token_remainder,
    jsonb_build_object('package', p_package, 'payment_required', false)
  );

  RETURN QUERY SELECT new_balance, wallet.token_remainder;
END;
$$;

CREATE OR REPLACE FUNCTION consume_gemini_tokens(
  p_user_id UUID,
  p_total_tokens INTEGER,
  p_source TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  quills_balance INTEGER,
  token_remainder INTEGER,
  charged_quills INTEGER,
  total_tokens INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet user_quill_wallets%ROWTYPE;
  prior_entry quill_ledger%ROWTYPE;
  combined_tokens INTEGER;
  charged INTEGER;
  new_remainder INTEGER;
  new_balance INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_total_tokens IS NULL OR p_total_tokens < 0 THEN
    RAISE EXCEPTION 'Invalid Gemini usage';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized to consume this wallet';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO prior_entry
    FROM quill_ledger
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY SELECT prior_entry.balance_after,
                          prior_entry.token_remainder_after,
                          ABS(prior_entry.quills_delta),
                          prior_entry.total_tokens;
      RETURN;
    END IF;
  END IF;

  INSERT INTO user_quill_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO wallet
  FROM user_quill_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  combined_tokens := wallet.token_remainder + p_total_tokens;
  charged := FLOOR(combined_tokens / 5000.0)::INTEGER;
  new_remainder := MOD(combined_tokens, 5000);
  new_balance := wallet.quills_balance - charged;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_QUILLS';
  END IF;

  UPDATE user_quill_wallets
  SET quills_balance = new_balance,
      token_remainder = new_remainder
  WHERE user_id = p_user_id;

  INSERT INTO quill_ledger (
    user_id, transaction_type, source, quills_delta, total_tokens,
    balance_after, token_remainder_after, idempotency_key, metadata
  ) VALUES (
    p_user_id, 'consumption', p_source, -charged, p_total_tokens,
    new_balance, new_remainder, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY SELECT new_balance, new_remainder, charged, p_total_tokens;
END;
$$;

REVOKE ALL ON FUNCTION consume_gemini_tokens(UUID, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_gemini_tokens(UUID, INTEGER, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_quill_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION grant_demo_quills(INTEGER, TEXT) TO authenticated;
