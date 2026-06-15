-- Migration 016 (2026-06-15): Separate MC reply from mentor action plan
-- Keeps mentor-submitted action_plan intact while MC can reply/close cases.

ALTER TABLE core_issues
  ADD COLUMN IF NOT EXISTS mc_reply TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

COMMENT ON COLUMN core_issues.mc_reply IS
  'MC reply/message back to Mentor for this core issue. Separate from mentor action_plan.';

COMMENT ON COLUMN core_issues.replied_at IS
  'Timestamp when MC last replied to this core issue.';
