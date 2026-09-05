-- Fix the retention function deployed in 20260905000120. system_job_runs uses
-- started_at as its lifecycle timestamp; it has never had a created_at column.
CREATE OR REPLACE FUNCTION public.purge_mobile_operational_history()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runs INTEGER;
  v_attempts INTEGER;
  v_jobs INTEGER;
  v_subscriptions INTEGER;
BEGIN
  DELETE FROM public.system_job_runs
  WHERE started_at < now() - interval '90 days';
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  DELETE FROM public.web_push_delivery_attempts
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_attempts = ROW_COUNT;

  DELETE FROM public.web_push_jobs
  WHERE status IN ('completed', 'dead_letter')
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  DELETE FROM public.web_push_subscriptions
  WHERE status IN ('revoked', 'expired')
    AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS v_subscriptions = ROW_COUNT;

  RETURN jsonb_build_object(
    'jobRuns', v_runs,
    'deliveryAttempts', v_attempts,
    'pushJobs', v_jobs,
    'subscriptions', v_subscriptions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_mobile_operational_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_mobile_operational_history() TO service_role;

COMMENT ON FUNCTION public.purge_mobile_operational_history() IS
  'Purges expired operational notification records using each table lifecycle timestamp.';
