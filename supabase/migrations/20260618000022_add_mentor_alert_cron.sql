-- Migration 022: Add mentorTeamAlert daily cron job
-- Notifies mentors when their team members are red/black traffic light
-- Runs daily at 10:00 UTC = 17:00 TH

-- Ensure call_cron_job exists (also defined in seed/03_cron_jobs.sql,
-- but migrations run before seeds in Supabase CLI so we guard here)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'call_cron_job'
  ) THEN
    -- Function body mirrors seed/03_cron_jobs.sql; seed will overwrite with project ref
    EXECUTE $fn$
      CREATE FUNCTION call_cron_job(job_name TEXT)
      RETURNS VOID LANGUAGE plpgsql AS $body$
      DECLARE
        function_url TEXT := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-jobs';
        cron_secret  TEXT := current_setting('app.cron_secret', true);
      BEGIN
        PERFORM net.http_post(
          url     := function_url,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || cron_secret
          ),
          body    := jsonb_build_object('job', job_name)
        );
      END;
      $body$
    $fn$;
  END IF;
END;
$$;

SELECT cron.schedule(
  'mentor-team-alert',
  '0 10 * * *',
  $$SELECT call_cron_job('mentorTeamAlert');$$
);
