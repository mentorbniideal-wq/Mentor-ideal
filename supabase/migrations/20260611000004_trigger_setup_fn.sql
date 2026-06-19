-- Function to rebuild all LINE cron jobs (called from Edge Function via rpc)
-- Requires pg_cron and pg_net extensions

CREATE OR REPLACE FUNCTION rebuild_line_cron_jobs()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_results TEXT[] := '{}';
  v_has_cron BOOLEAN;
BEGIN
  -- Check pg_cron
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  IF NOT v_has_cron THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pg_cron extension not enabled — enable it in Supabase Dashboard > Database > Extensions');
  END IF;

  -- Remove old jobs if they exist (ignore errors)
  BEGIN PERFORM cron.unschedule('thursday-line-score-alert');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('wednesday-mentor-nudge');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('thursday-checkin-reminder');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('daily-anniversary-check');      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('thursday-post-meeting-prompt'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('friday-weekly-score-push');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('friday-team-leaderboard');      EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('friday-chapter-pulse');         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('monday-brief');                 EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('wednesday-121-reminder');       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('monthly-recap');                EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Recreate all jobs
  PERFORM cron.schedule('thursday-line-score-alert',    '0 0 * * 4', $q$ SELECT call_edge_function('triggerScoreAlert'); $q$);
  v_results := array_append(v_results, '✅ Score Alert — ทุกพฤหัส 07:00 TH');

  PERFORM cron.schedule('wednesday-mentor-nudge',       '0 9 * * 3', $q$ SELECT call_edge_function('triggerWednesdayNudge'); $q$);
  v_results := array_append(v_results, '✅ Wednesday Nudge — ทุกพุธ 16:00 TH');

  PERFORM cron.schedule('thursday-checkin-reminder',    '0 23 * * 3', $q$ SELECT call_edge_function('triggerCheckinReminder'); $q$);
  v_results := array_append(v_results, '✅ Check-In Reminder — ทุกพฤหัส 06:00 TH');

  PERFORM cron.schedule('daily-anniversary-check',      '0 2 * * *', $q$ SELECT call_edge_function('triggerAnniversary'); $q$);
  v_results := array_append(v_results, '✅ Anniversary Alert — ทุกวัน 09:00 TH');

  PERFORM cron.schedule('thursday-post-meeting-prompt', '0 7 * * 4', $q$ SELECT call_edge_function('triggerPostMeetingPrompt'); $q$);
  v_results := array_append(v_results, '✅ Post-Meeting Prompt — ทุกพฤหัส 14:00 TH');

  PERFORM cron.schedule('friday-weekly-score-push',     '0 1 * * 5', $q$ SELECT call_edge_function('triggerWeeklyScorePush'); $q$);
  v_results := array_append(v_results, '✅ Weekly Score Push — ทุกศุกร์ 08:00 TH');

  PERFORM cron.schedule('friday-team-leaderboard',      '0 2 * * 5', $q$ SELECT call_edge_function('triggerTeamLeaderboard'); $q$);
  v_results := array_append(v_results, '✅ Team Leaderboard — ทุกศุกร์ 09:00 TH');

  PERFORM cron.schedule('friday-chapter-pulse',         '0 3 * * 5', $q$ SELECT call_edge_function('triggerChapterPulse'); $q$);
  v_results := array_append(v_results, '✅ Chapter Pulse — ทุกศุกร์ 10:00 TH');

  PERFORM cron.schedule('monday-brief',                 '0 1 * * 1', $q$ SELECT call_edge_function('triggerMondayBrief'); $q$);
  v_results := array_append(v_results, '✅ Monday Brief — ทุกจันทร์ 08:00 TH');

  PERFORM cron.schedule('wednesday-121-reminder',       '0 11 * * 3', $q$ SELECT call_edge_function('trigger121Reminder'); $q$);
  v_results := array_append(v_results, '✅ 1-2-1 Reminder — ทุกพุธ 18:00 TH');

  PERFORM cron.schedule('monthly-recap',                '0 2 28 * *', $q$ SELECT call_edge_function('triggerMonthlyRecap'); $q$);
  v_results := array_append(v_results, '✅ Monthly Recap — วันที่ 28 ทุกเดือน 09:00 TH');

  RETURN jsonb_build_object('ok', true, 'results', to_jsonb(v_results));
END;
$$;
