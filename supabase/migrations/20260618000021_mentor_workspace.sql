-- Migration 021: Mentor workspace support
-- Preserves the action already taken in Core Issue reports and supports
-- professional follow-up workflows without changing existing report rows.

ALTER TABLE core_issues
  ADD COLUMN IF NOT EXISTS action_taken TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

COMMENT ON COLUMN core_issues.action_taken IS
  'What the Mentor has already done before submitting the Core Issue report.';

COMMENT ON COLUMN core_issues.follow_up_at IS
  'Optional next follow-up date/time for the Mentor workspace.';

CREATE INDEX IF NOT EXISTS idx_core_issues_follow_up
  ON core_issues(mentor_team, follow_up_at)
  WHERE status = 'open' AND follow_up_at IS NOT NULL;
