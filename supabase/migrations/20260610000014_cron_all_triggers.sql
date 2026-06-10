-- Additional pg_cron schedules for all LINE auto-triggers
-- All times are UTC; Bangkok = UTC+7 (no DST)

-- Thursday 6:00AM Bangkok = Wednesday 23:00 UTC
SELECT cron.schedule(
  'thursday-checkin-reminder',
  '0 23 * * 3',
  $$ SELECT call_edge_function('triggerCheckinReminder'); $$
);

-- Daily 9:00AM Bangkok = 2:00 UTC
SELECT cron.schedule(
  'daily-anniversary-check',
  '0 2 * * *',
  $$ SELECT call_edge_function('triggerAnniversary'); $$
);

-- Thursday 2:00PM Bangkok = 7:00 UTC Thursday (after morning meeting)
SELECT cron.schedule(
  'thursday-post-meeting-prompt',
  '0 7 * * 4',
  $$ SELECT call_edge_function('triggerPostMeetingPrompt'); $$
);

-- Friday 8:00AM Bangkok = 1:00 UTC Friday
SELECT cron.schedule(
  'friday-weekly-score-push',
  '0 1 * * 5',
  $$ SELECT call_edge_function('triggerWeeklyScorePush'); $$
);

-- Friday 9:00AM Bangkok = 2:00 UTC Friday
SELECT cron.schedule(
  'friday-team-leaderboard',
  '0 2 * * 5',
  $$ SELECT call_edge_function('triggerTeamLeaderboard'); $$
);

-- Friday 10:00AM Bangkok = 3:00 UTC Friday
SELECT cron.schedule(
  'friday-chapter-pulse',
  '0 3 * * 5',
  $$ SELECT call_edge_function('triggerChapterPulse'); $$
);

-- Monday 8:00AM Bangkok = 1:00 UTC Monday
SELECT cron.schedule(
  'monday-brief',
  '0 1 * * 1',
  $$ SELECT call_edge_function('triggerMondayBrief'); $$
);

-- Wednesday 6:00PM Bangkok = 11:00 UTC Wednesday
SELECT cron.schedule(
  'wednesday-121-reminder',
  '0 11 * * 3',
  $$ SELECT call_edge_function('trigger121Reminder'); $$
);

-- Last day of each month 9:00AM Bangkok = 2:00 UTC
-- Note: pg_cron doesn't have a "last day of month" expression natively;
-- run on the 28th to cover all months (Feb included), with day-28 check in handler if needed
SELECT cron.schedule(
  'monthly-recap',
  '0 2 28 * *',
  $$ SELECT call_edge_function('triggerMonthlyRecap'); $$
);
