-- LINE Safety Consolidation
-- Retire schedules that call the pre-governance API trigger endpoints. The
-- modern `line-*` cron jobs remain intact and continue to obey controls.

DO $$
DECLARE
  v_job TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH v_job IN ARRAY ARRAY[
      'thursday-line-score-alert',
      'wednesday-mentor-nudge',
      'thursday-checkin-reminder',
      'daily-anniversary-check',
      'thursday-post-meeting-prompt',
      'friday-weekly-score-push',
      'friday-team-leaderboard',
      'friday-chapter-pulse',
      'monday-brief',
      'wednesday-121-reminder',
      'monthly-recap'
    ] LOOP
      BEGIN
        PERFORM cron.unschedule(v_job);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
END;
$$;

-- Coordinator controls must run so their child controls remain the source of
-- truth. They do not send messages themselves.
UPDATE public.line_automation_controls
SET enabled = true,
    protected = true,
    decision = 'system',
    importance = 'system',
    quota_impact = 'none',
    delivery_kind = 'system',
    updated_at = now(),
    updated_by = 'system:line-safety-consolidation'
WHERE automation_key IN ('mondayMorningBrief', 'fridayEveningReminder');

-- Keep every legacy marker locked off. Presets must preserve this state.
UPDATE public.line_automation_controls
SET enabled = false,
    protected = true,
    decision = 'disable',
    updated_at = now(),
    updated_by = 'system:line-safety-consolidation'
WHERE automation_key LIKE 'legacyGas%';

INSERT INTO public.settings(key, value) VALUES
  ('LINE_LEGACY_SEND_ACTIONS_ENABLED', 'false'),
  ('LINE_QUOTA_ACCOUNTING_MODE', 'recipient_count')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
