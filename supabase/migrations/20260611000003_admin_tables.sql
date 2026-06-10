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
ALTER TABLE chapter_revenue_goals ENABLE ROW LEVEL SECURITY;
