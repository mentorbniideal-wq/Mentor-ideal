-- Migration 022: Add mentorTeamAlert daily cron job
-- Notifies mentors when their team members are red/black traffic light
-- Runs daily at 10:00 UTC = 17:00 TH

SELECT cron.schedule(
  'mentor-team-alert',
  '0 10 * * *',
  $$SELECT call_cron_job('mentorTeamAlert');$$
);
