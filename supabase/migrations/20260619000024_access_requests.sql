-- Migration 024: Access Requests
-- Stores pending requests from Google-authenticated users who aren't in role_assignments

CREATE TABLE IF NOT EXISTS public.access_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL,
  name                TEXT,
  requested_sections  TEXT[]      DEFAULT '{}',
  edit_access         BOOLEAN     DEFAULT false,
  reason              TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT
);

CREATE INDEX IF NOT EXISTS access_requests_status_idx ON public.access_requests (status);
CREATE INDEX IF NOT EXISTS access_requests_email_idx  ON public.access_requests (email);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_requests FROM anon, authenticated;

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS admin_sections TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_edit_access BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.role_assignments.admin_sections IS
  'Admin Panel sections granted to this account. Empty means no delegated admin access.';
COMMENT ON COLUMN public.role_assignments.admin_edit_access IS
  'False = view only for delegated admin sections. MC always retains full access.';

CREATE TABLE IF NOT EXISTS public.notification_receipts (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_key   TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  PRIMARY KEY (notification_id, recipient_key)
);

ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_receipts FROM anon, authenticated;

ALTER TABLE public.one_to_one_logs
  ADD COLUMN IF NOT EXISTS partner_name TEXT,
  ADD COLUMN IF NOT EXISTS logged_by_role TEXT;

-- Repair cron helpers already deployed by earlier migrations.
CREATE OR REPLACE FUNCTION public.call_edge_function(
  p_action TEXT,
  p_extra JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url    TEXT;
  v_key    TEXT;
  v_secret TEXT;
  v_body   JSONB;
BEGIN
  SELECT value INTO v_url    FROM public.cron_config WHERE key = 'edge_url';
  SELECT value INTO v_key    FROM public.cron_config WHERE key = 'anon_key';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'cron_secret';

  v_body := jsonb_build_object('action', p_action, 'cron_secret', v_secret) || p_extra;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := v_body
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'call_edge_function(%) failed: %', p_action, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_line_cron_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results TEXT[] := ARRAY[]::TEXT[];
  v_has_cron BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  IF NOT v_has_cron THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pg_cron extension not enabled');
  END IF;

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

  PERFORM cron.schedule('thursday-line-score-alert', '0 0 * * 4', $q$SELECT call_edge_function('triggerScoreAlert');$q$);
  v_results := array_append(v_results, '✅ Score Alert — ทุกพฤหัส 07:00 TH');
  PERFORM cron.schedule('wednesday-mentor-nudge', '0 11 * * 4', $q$SELECT call_edge_function('triggerWednesdayNudge');$q$);
  v_results := array_append(v_results, '✅ Friday Meeting Reminder — ทุกพฤหัส 18:00 TH');
  PERFORM cron.schedule('thursday-checkin-reminder', '0 23 * * 3', $q$SELECT call_edge_function('triggerCheckinReminder');$q$);
  v_results := array_append(v_results, '✅ Friday Prep Reminder — ทุกพฤหัส 06:00 TH');
  PERFORM cron.schedule('daily-anniversary-check', '0 2 * * *', $q$SELECT call_edge_function('triggerAnniversary');$q$);
  v_results := array_append(v_results, '✅ Anniversary Alert — ทุกวัน 09:00 TH');
  PERFORM cron.schedule('thursday-post-meeting-prompt', '0 7 * * 4', $q$SELECT call_edge_function('triggerPostMeetingPrompt');$q$);
  v_results := array_append(v_results, '✅ Friday Prep Prompt — ทุกพฤหัส 14:00 TH');
  PERFORM cron.schedule('friday-weekly-score-push', '0 1 * * 5', $q$SELECT call_edge_function('triggerWeeklyScorePush');$q$);
  v_results := array_append(v_results, '✅ Weekly Score Push — ทุกศุกร์ 08:00 TH');
  PERFORM cron.schedule('friday-team-leaderboard', '0 2 * * 5', $q$SELECT call_edge_function('triggerTeamLeaderboard');$q$);
  v_results := array_append(v_results, '✅ Team Leaderboard — ทุกศุกร์ 09:00 TH');
  PERFORM cron.schedule('friday-chapter-pulse', '0 3 * * 5', $q$SELECT call_edge_function('triggerChapterPulse');$q$);
  v_results := array_append(v_results, '✅ Chapter Pulse — ทุกศุกร์ 10:00 TH');
  PERFORM cron.schedule('monday-brief', '0 1 * * 1', $q$SELECT call_edge_function('triggerMondayBrief');$q$);
  v_results := array_append(v_results, '✅ Monday Brief — ทุกจันทร์ 08:00 TH');
  PERFORM cron.schedule('wednesday-121-reminder', '0 11 * * 3', $q$SELECT call_edge_function('trigger121Reminder');$q$);
  v_results := array_append(v_results, '✅ 1-2-1 Reminder — ทุกพุธ 18:00 TH');
  PERFORM cron.schedule('monthly-recap', '0 2 28 * *', $q$SELECT call_edge_function('triggerMonthlyRecap');$q$);
  v_results := array_append(v_results, '✅ Monthly Recap — วันที่ 28 ทุกเดือน 09:00 TH');

  RETURN jsonb_build_object('ok', true, 'results', to_jsonb(v_results));
END;
$$;

ALTER FUNCTION public.fn_palms_score(
  INT, INT, INT, INT, INT, INT, INT, INT, INT, NUMERIC, NUMERIC
) STABLE;
