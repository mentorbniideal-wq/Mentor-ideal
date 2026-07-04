-- BNI IDEAL now meets on Fridays.
-- Keep the historical job key for compatibility, but run the reminder on
-- Thursday 18:00 Bangkok (11:00 UTC) and describe it as a Friday meeting prep.

CREATE OR REPLACE FUNCTION public.rebuild_line_cron_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_legacy_names TEXT[] := ARRAY[
    'thursday-line-score-alert', 'wednesday-mentor-nudge',
    'thursday-checkin-reminder', 'daily-anniversary-check',
    'thursday-post-meeting-prompt', 'friday-weekly-score-push',
    'friday-team-leaderboard', 'friday-chapter-pulse',
    'monday-brief', 'wednesday-121-reminder', 'monthly-recap',
    'thursday-score-push', 'wednesday-nudge', 'friday-reminder',
    'friday-leaderboard', 'daily-121-reminder', 'daily-renewal-push',
    'daily-purge-dismissals', 'daily-mentor-team-alert',
    'line-monday-brief', 'line-wednesday-nudge', 'line-thursday-score',
    'line-friday-recap', 'line-monthly-recap', 'line-mentor-alert',
    'line-121-reminder', 'line-renewal', 'line-purge-dismissals'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pg_cron extension not enabled');
  END IF;

  FOREACH v_name IN ARRAY v_legacy_names LOOP
    BEGIN
      PERFORM cron.unschedule(v_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  PERFORM cron.schedule('line-monday-brief', '0 1 * * 1',
    $job$SELECT public.call_cron_job('mondayMorningBrief');$job$);
  -- Thursday 18:00 Bangkok: remind members that Friday is meeting day.
  PERFORM cron.schedule('line-wednesday-nudge', '0 11 * * 4',
    $job$SELECT public.call_cron_job('wednesdayNudge');$job$);
  PERFORM cron.schedule('line-thursday-score', '0 0 * * 4',
    $job$SELECT public.call_cron_job('thursdayBotPush');$job$);
  PERFORM cron.schedule('line-friday-recap', '0 6 * * 5',
    $job$SELECT public.call_cron_job('fridayEveningReminder');$job$);
  PERFORM cron.schedule('line-monthly-recap', '0 1 1 * *',
    $job$SELECT public.call_cron_job('monthlyRecap');$job$);
  PERFORM cron.schedule('line-mentor-alert', '0 10 * * *',
    $job$SELECT public.call_cron_job('mentorTeamAlert');$job$);
  PERFORM cron.schedule('line-121-reminder', '0 11 * * 3',
    $job$SELECT public.call_cron_job('line121AutoReminder');$job$);
  PERFORM cron.schedule('line-renewal', '0 3 * * *',
    $job$SELECT public.call_cron_job('renewalPush');$job$);
  PERFORM cron.schedule('line-purge-dismissals', '0 17 * * *',
    $job$SELECT public.call_cron_job('purgeExpiredDismissals');$job$);

  RETURN jsonb_build_object(
    'ok', true,
    'results', jsonb_build_array(
      'line-monday-brief', 'line-thursday-friday-meeting-reminder', 'line-thursday-score',
      'line-friday-recap', 'line-monthly-recap', 'line-mentor-alert',
      'line-121-reminder', 'line-renewal', 'line-purge-dismissals'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_line_cron_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_line_cron_jobs() TO service_role;

-- Apply the corrected schedule immediately when this migration is pushed.
SELECT public.rebuild_line_cron_jobs();
