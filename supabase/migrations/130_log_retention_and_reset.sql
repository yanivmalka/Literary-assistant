-- ============================================
-- Request/error log retention and reset
-- Keeps seven days of logs and provides a service-role-only full reset.
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_request_error_logs(
  p_retention INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (
  deleted_links BIGINT,
  deleted_error_details BIGINT,
  deleted_user_errors BIGINT,
  deleted_requests BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ;
BEGIN
  IF p_retention <= INTERVAL '0 days' OR p_retention > INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Retention must be greater than 0 and no more than 30 days';
  END IF;

  cutoff := NOW() - p_retention;

  DELETE FROM public.request_error_links AS links
  WHERE EXISTS (
    SELECT 1
    FROM public.user_request_logs AS requests
    WHERE requests.request_id = links.request_id
      AND requests.created_at < cutoff
  )
  OR EXISTS (
    SELECT 1
    FROM public.error_details AS details
    WHERE details.id = links.error_detail_id
      AND details.created_at < cutoff
  );
  GET DIAGNOSTICS deleted_links = ROW_COUNT;

  DELETE FROM public.error_details
  WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_error_details = ROW_COUNT;

  DELETE FROM public.user_error_logs
  WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_user_errors = ROW_COUNT;

  DELETE FROM public.user_request_logs
  WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_requests = ROW_COUNT;

  RETURN QUERY SELECT
    deleted_links,
    deleted_error_details,
    deleted_user_errors,
    deleted_requests;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_request_error_logs()
RETURNS TABLE (
  deleted_links BIGINT,
  deleted_error_details BIGINT,
  deleted_user_errors BIGINT,
  deleted_requests BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.request_error_links;
  GET DIAGNOSTICS deleted_links = ROW_COUNT;

  DELETE FROM public.error_details;
  GET DIAGNOSTICS deleted_error_details = ROW_COUNT;

  DELETE FROM public.user_error_logs;
  GET DIAGNOSTICS deleted_user_errors = ROW_COUNT;

  DELETE FROM public.user_request_logs;
  GET DIAGNOSTICS deleted_requests = ROW_COUNT;

  RETURN QUERY SELECT
    deleted_links,
    deleted_error_details,
    deleted_user_errors,
    deleted_requests;
END;
$$;

-- These functions are not exposed to end users through RPC.
REVOKE ALL ON FUNCTION public.cleanup_request_error_logs(INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_request_error_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_request_error_logs(INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_request_error_logs() TO service_role;

-- pg_cron is available in Supabase projects after the extension is enabled.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'cleanup-request-error-logs-weekly';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'cleanup-request-error-logs-weekly',
    '0 3 * * 0',
    'SELECT public.cleanup_request_error_logs()'
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_request_error_logs(INTERVAL) IS
  'Deletes request/error log data older than the requested retention period; weekly cron uses seven days.';
COMMENT ON FUNCTION public.reset_request_error_logs() IS
  'Deletes all request/error log data. Execute only through the protected server maintenance endpoint.';
