-- Sprint Board: add proper per-sprint columns so history can be stored
-- Each sprint is a separate row; old plan_data JSONB is dropped.

ALTER TABLE sprint_board DROP CONSTRAINT IF EXISTS sprint_board_mentor_team_key;

ALTER TABLE sprint_board DROP COLUMN IF EXISTS plan_data;

ALTER TABLE sprint_board
  ADD COLUMN IF NOT EXISTS year    SMALLINT NOT NULL DEFAULT EXTRACT(YEAR  FROM NOW())::SMALLINT,
  ADD COLUMN IF NOT EXISTS month   SMALLINT NOT NULL DEFAULT EXTRACT(MONTH FROM NOW())::SMALLINT,
  ADD COLUMN IF NOT EXISTS target  BIGINT   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus   TEXT,
  ADD COLUMN IF NOT EXISTS pairs   TEXT,
  ADD COLUMN IF NOT EXISTS status  TEXT     NOT NULL DEFAULT 'pending';

ALTER TABLE sprint_board
  ADD CONSTRAINT sprint_board_team_month_key UNIQUE(mentor_team, year, month);
