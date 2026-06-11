-- Member lifecycle improvements:
-- 1. Add joined_date for accurate 8W tracking
-- 2. Add member_status for lifecycle state tracking

ALTER TABLE members ADD COLUMN IF NOT EXISTS joined_date DATE;

COMMENT ON COLUMN members.joined_date IS
  'Actual BNI join date — set when addNewMember is called. '
  'Distinct from created_at (app record creation time). '
  'Used to calculate 8-week and 12-month program deadlines.';
