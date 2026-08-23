-- ============================================
-- Request and error detail relations
-- Keeps a request record and links every error detail to its originating request.
-- Existing user_error_logs rows are preserved and backfilled into the relation tables.
-- ============================================

CREATE TABLE IF NOT EXISTS user_request_logs (
  request_id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  http_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  status_code INTEGER NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_details (
  id UUID PRIMARY KEY,
  error_code TEXT NOT NULL,
  error_message TEXT,
  status_code INTEGER NOT NULL CHECK (status_code BETWEEN 400 AND 599),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_error_links (
  request_id UUID NOT NULL REFERENCES user_request_logs(request_id) ON DELETE CASCADE,
  error_detail_id UUID NOT NULL REFERENCES error_details(id) ON DELETE CASCADE,
  user_error_log_id UUID REFERENCES user_error_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, error_detail_id)
);

CREATE INDEX IF NOT EXISTS idx_user_request_logs_user_created
  ON user_request_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_request_logs_action_created
  ON user_request_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_request_logs_status_created
  ON user_request_logs(status_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_details_code_created
  ON error_details(error_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_error_links_error
  ON request_error_links(error_detail_id);

CREATE INDEX IF NOT EXISTS idx_request_error_links_legacy_log
  ON request_error_links(user_error_log_id);

ALTER TABLE user_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_error_links ENABLE ROW LEVEL SECURITY;

-- Backfill request records for historical error logs.
INSERT INTO user_request_logs (
  request_id,
  user_id,
  action,
  http_method,
  request_path,
  status_code,
  started_at,
  completed_at,
  duration_ms,
  created_at
)
SELECT DISTINCT ON (request_id)
  request_id,
  user_id,
  action,
  http_method,
  request_path,
  status_code,
  created_at,
  created_at,
  CASE
    WHEN details->>'duration_ms' ~ '^[0-9]+$' THEN (details->>'duration_ms')::INTEGER
    ELSE 0
  END,
  created_at
FROM user_error_logs
ORDER BY request_id, created_at DESC
ON CONFLICT (request_id) DO NOTHING;

-- Reuse the legacy error-log ID so historical and new records can be correlated.
INSERT INTO error_details (id, error_code, error_message, status_code, details, created_at)
SELECT id, error_code, error_message, status_code, details, created_at
FROM user_error_logs
ON CONFLICT (id) DO NOTHING;

INSERT INTO request_error_links (request_id, error_detail_id, user_error_log_id, created_at)
SELECT l.request_id, l.id, l.id, l.created_at
FROM user_error_logs AS l
JOIN user_request_logs AS r ON r.request_id = l.request_id
ON CONFLICT (request_id, error_detail_id) DO NOTHING;

COMMENT ON TABLE user_request_logs IS 'One correlation record for every HTTP request, successful or failed.';
COMMENT ON TABLE error_details IS 'Detailed information for an HTTP error occurrence.';
COMMENT ON TABLE request_error_links IS 'Associates requests with the error details caused by those requests.';
