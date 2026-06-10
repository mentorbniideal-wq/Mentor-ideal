-- ============================================================
-- Migration 003: Coaching & Mentor Accountability
-- core_issues, action_logs, mentor_logs, ninety_day_reviews
-- ============================================================

-- ============================================================
-- core_issues — one open issue per member at a time (mentor-owned)
-- Source: col X (JSON) in individual mentor sheets (TOOMTAM/Aof/Draft/PHAI/AMP)
-- FK to mentor_teams because mentor owns the issue (see analysis Q2)
-- ============================================================
CREATE TABLE core_issues (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mentor_team  TEXT    NOT NULL REFERENCES mentor_teams(name),
  issue_text   TEXT    NOT NULL,
  action_plan  TEXT,
  status       TEXT    NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'resolved', 'snoozed')),
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Enforce: only one open issue per member at a time
CREATE UNIQUE INDEX idx_core_issues_one_open_per_member
  ON core_issues(member_id)
  WHERE status = 'open';

CREATE INDEX idx_core_issues_mentor  ON core_issues(mentor_team);
CREATE INDEX idx_core_issues_status  ON core_issues(status);

COMMENT ON TABLE core_issues IS
  'One open Core Issue per member (mentor-owned). '
  'Alerts fire if status=open AND opened_at > 14 days ago (stale_case alert). '
  'Historical closed issues are kept for coaching review.';

-- ============================================================
-- action_logs — mentor accountability tracker
-- Source: 📜 ACTION LOGS sheet
-- Records every coaching intervention + tracks score delta
-- ============================================================
CREATE TABLE action_logs (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_team  TEXT    NOT NULL,
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  score_before NUMERIC(5,1),
  core_issue   TEXT,
  action_taken TEXT,
  next_plan    TEXT,
  score_after  NUMERIC(5,1),
  delta        NUMERIC(5,1),     -- score_after - score_before; positive = improvement
  status       TEXT    NOT NULL DEFAULT 'tracking'
               CHECK (status IN ('tracking', 'improved', 'declined', 'stable')),
  log_month    TEXT,             -- MM/YY display label e.g. '06/26'
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_action_logs_member  ON action_logs(member_id);
CREATE INDEX idx_action_logs_mentor  ON action_logs(mentor_team);
CREATE INDEX idx_action_logs_created ON action_logs(created_at DESC);

COMMENT ON TABLE action_logs IS
  'Mentor ROI tracker. score_after is filled in next monthly sync '
  'by comparing current latest_score to score_before.';

-- ============================================================
-- mentor_logs — coaching session records
-- Source: 📋 MENTOR LOGS sheet
-- ============================================================
CREATE TABLE mentor_logs (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_team  TEXT    NOT NULL,
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  session_date DATE    NOT NULL,
  notes        TEXT,
  next_actions TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mentor_logs_member  ON mentor_logs(member_id);
CREATE INDEX idx_mentor_logs_mentor  ON mentor_logs(mentor_team);
CREATE INDEX idx_mentor_logs_date    ON mentor_logs(session_date DESC);

-- ============================================================
-- ninety_day_reviews — structured 90-day member review
-- Source: apiSave90DayReview / apiGet90DayReviews
-- content stored as JSONB to accommodate flexible form fields
-- ============================================================
CREATE TABLE ninety_day_reviews (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mentor_team  TEXT    NOT NULL,
  review_date  DATE    NOT NULL,
  content      JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ninety_day_member ON ninety_day_reviews(member_id);
CREATE INDEX idx_ninety_day_date   ON ninety_day_reviews(review_date DESC);
