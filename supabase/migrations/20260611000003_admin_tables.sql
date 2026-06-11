-- Admin panel compatibility tables/columns.
--
-- Note: action_logs and chapter_revenue_goals may already exist from earlier
-- migrations with the legacy app schema. This migration is intentionally an
-- upgrade migration, not just CREATE TABLE IF NOT EXISTS, so it can be safely
-- run after the core migrations in production.

-- action_logs: track actions taken on members
CREATE TABLE IF NOT EXISTS action_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid REFERENCES members(id) ON DELETE CASCADE,
  mentor_team text,
  action_text text NOT NULL,
  action_by   text NOT NULL DEFAULT 'MC',
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE action_logs
  ADD COLUMN IF NOT EXISTS action_text text,
  ADD COLUMN IF NOT EXISTS action_by text NOT NULL DEFAULT 'MC',
  ADD COLUMN IF NOT EXISTS action_date date NOT NULL DEFAULT CURRENT_DATE;

-- Admin logs can be entered before an exact member match is available.
ALTER TABLE action_logs ALTER COLUMN member_id DROP NOT NULL;

DO $$
DECLARE
  v_backfill_expr text := '''Legacy action log''';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'action_logs' AND column_name = 'next_plan'
  ) THEN
    v_backfill_expr := 'next_plan, ' || v_backfill_expr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'action_logs' AND column_name = 'core_issue'
  ) THEN
    v_backfill_expr := 'core_issue, ' || v_backfill_expr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'action_logs' AND column_name = 'action_taken'
  ) THEN
    v_backfill_expr := 'action_taken, ' || v_backfill_expr;
  END IF;

  EXECUTE format(
    'UPDATE action_logs SET action_text = COALESCE(action_text, %s) WHERE action_text IS NULL',
    v_backfill_expr
  );
END $$;

ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

-- chapter_revenue_goals: monthly revenue targets
CREATE TABLE IF NOT EXISTS chapter_revenue_goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year       int NOT NULL,
  month      int NOT NULL,
  goal_thb   bigint NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

ALTER TABLE chapter_revenue_goals
  ADD COLUMN IF NOT EXISTS year int,
  ADD COLUMN IF NOT EXISTS month int,
  ADD COLUMN IF NOT EXISTS goal_thb bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS goal_type text,
  ADD COLUMN IF NOT EXISTS target numeric(14,2),
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE chapter_revenue_goals
SET
  year = COALESCE(year, EXTRACT(YEAR FROM created_at)::int),
  month = COALESCE(month, EXTRACT(MONTH FROM created_at)::int),
  goal_thb = CASE
    WHEN goal_thb IS NULL OR goal_thb = 0 THEN COALESCE(target, 0)::bigint
    ELSE goal_thb
  END,
  target = COALESCE(target, goal_thb::numeric),
  goal_type = COALESCE(goal_type, 'tyfcb'),
  period = COALESCE(period, 'current')
WHERE year IS NULL
   OR month IS NULL
   OR goal_thb IS NULL
   OR target IS NULL
   OR goal_type IS NULL
   OR period IS NULL;

CREATE INDEX IF NOT EXISTS idx_chapter_revenue_goals_year_month
  ON chapter_revenue_goals(year DESC, month DESC);

ALTER TABLE chapter_revenue_goals ENABLE ROW LEVEL SECURITY;
