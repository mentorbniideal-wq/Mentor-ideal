-- ============================================================
-- pg_cron scheduled jobs
-- Replaces all ScriptApp.newTrigger() from WEBAPP.js + L.js
--
-- Prerequisites:
--   1. Enable pg_cron extension in Supabase Dashboard → Extensions
--   2. Enable pg_net extension (for HTTP calls)
--   3. Set CRON_SECRET env var in Edge Functions
--   4. Replace <PROJECT_REF> with your Supabase project reference
--
-- All times in UTC. Thailand = UTC+7
--   UTC 00:00 = TH 07:00
--   UTC 01:00 = TH 08:00
--   UTC 06:00 = TH 13:00
--   UTC 09:00 = TH 16:00
--   UTC 10:00 = TH 17:00
--   UTC 16:00 = TH 23:00
--   UTC 23:00 = TH 06:00 next day (Wednesday night TH)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Helper function to call cron-jobs Edge Function ──────────
CREATE OR REPLACE FUNCTION call_cron_job(job_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
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
$$;

-- ── Schedule all jobs ─────────────────────────────────────────

-- Thursday 07:00 TH (00:00 UTC) — Weekly score push to all LINE members
SELECT cron.schedule(
  'thursday-score-push',
  '0 0 * * 4',
  $$SELECT call_cron_job('thursdayBotPush');$$
);

-- Wednesday night TH (23:00 UTC Wed = 06:00 UTC Thu, so use Wed 22:00 UTC = TH Thu 05:00?)
-- Actually: Wed 23:00 UTC = Thu 06:00 TH. Use Wed 16:00 UTC = Wed 23:00 TH for nudge
SELECT cron.schedule(
  'wednesday-nudge',
  '0 16 * * 3',
  $$SELECT call_cron_job('wednesdayNudge');$$
);

-- Monday 08:00 TH (01:00 UTC Monday) — Monday morning brief to MC
SELECT cron.schedule(
  'monday-brief',
  '0 1 * * 1',
  $$SELECT call_cron_job('mondayMorningBrief');$$
);

-- Friday 13:00 TH (06:00 UTC Friday) — Post-meeting reminder
SELECT cron.schedule(
  'friday-reminder',
  '0 6 * * 5',
  $$SELECT call_cron_job('fridayEveningReminder');$$
);

-- Friday 16:00 TH (09:00 UTC Friday) — Team leaderboard to MC
SELECT cron.schedule(
  'friday-leaderboard',
  '0 9 * * 5',
  $$SELECT call_cron_job('fridayTeamLeaderboard');$$
);

-- 1st of each month 08:00 TH (01:00 UTC) — Monthly recap
SELECT cron.schedule(
  'monthly-recap',
  '0 1 1 * *',
  $$SELECT call_cron_job('monthlyRecap');$$
);

-- Daily 23:00 TH (16:00 UTC) — 1-2-1 pending reminder
SELECT cron.schedule(
  'daily-121-reminder',
  '0 16 * * *',
  $$SELECT call_cron_job('line121AutoReminder');$$
);

-- Daily 23:00 TH (16:00 UTC) — Renewal expiry warnings (offset 30 min)
SELECT cron.schedule(
  'daily-renewal-push',
  '30 16 * * *',
  $$SELECT call_cron_job('renewalPush');$$
);

-- Daily 17:00 UTC — Purge expired alert dismissals (7-day TTL)
SELECT cron.schedule(
  'daily-purge-dismissals',
  '0 17 * * *',
  $$SELECT call_cron_job('purgeExpiredDismissals');$$
);

-- Daily 00:00 UTC (07:00 TH) — Passport LT reminder (2 days ahead)
SELECT cron.schedule(
  'daily-passport-lt-reminder',
  '0 0 * * *',
  $$SELECT call_cron_job('passportLtReminder');$$
);

-- 1st of each month 09:00 TH (02:00 UTC) — Personal monthly report to all LINE members
SELECT cron.schedule(
  'monthly-personal-report',
  '0 2 1 * *',
  $$SELECT call_cron_job('monthlyPersonalReport');$$
);

-- Daily 01:00 UTC (08:00 TH) — Visitor follow-up reminder (14 days after visit)
SELECT cron.schedule(
  'daily-visitor-followup',
  '0 1 * * *',
  $$SELECT call_cron_job('visitorFollowUpReminder');$$
);

-- ── Verify schedule ───────────────────────────────────────────
-- Run after setup:
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
