-- ============================================
-- User error logs
-- Records failed HTTP actions and the authenticated user that triggered them.
-- Inserts are performed by the server with the Supabase service role.
-- ============================================

CREATE TABLE IF NOT EXISTS user_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id UUID NOT NULL,
  action TEXT NOT NULL,
  http_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  status_code INTEGER NOT NULL CHECK (status_code BETWEEN 400 AND 599),
  error_code TEXT NOT NULL,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_error_logs_user_created
  ON user_error_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_error_logs_action_created
  ON user_error_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_error_logs_status_created
  ON user_error_logs(status_code, created_at DESC);

-- Keep this table server-write-only. The service-role client bypasses RLS;
-- no end-user policy is created so users cannot read or forge operational logs.
ALTER TABLE user_error_logs ENABLE ROW LEVEL SECURITY;
