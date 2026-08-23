-- ============================================
-- Weekly full reset for request/error logs
-- The weekly job intentionally empties all four related log tables.
-- ============================================

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
    'SELECT public.reset_request_error_logs()'
  );
END;
$$;

COMMENT ON FUNCTION public.reset_request_error_logs() IS
  'Deletes all request/error log data. Used by the protected maintenance endpoint and weekly cron reset.';
