-- ============================================================
-- Migration 006: Operational Tables
-- 1-2-1 logs, visitor log, member notes, broadcasts,
-- MC assignments, growth tasks, power teams, renewals,
-- sprint board, cross-team synergy
-- ============================================================

-- ============================================================
-- one_to_one_logs — 1-2-1 meeting schedule & outcome history
-- Source: 📝 1-2-1 LOGS sheet + LINE Bot "นัด" / "เจอแล้ว" commands
-- ============================================================
CREATE TABLE one_to_one_logs (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id   UUID    NOT NULL REFERENCES members(id),
  partner_id     UUID    NOT NULL REFERENCES members(id),
  scheduled_date DATE,
  met_at         TIMESTAMPTZ,      -- set when "เจอแล้ว" confirmed
  outcome        TEXT,             -- result of the meeting (from LINE Bot)
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_121_logs_initiator ON one_to_one_logs(initiator_id);
CREATE INDEX idx_121_logs_partner   ON one_to_one_logs(partner_id);
CREATE INDEX idx_121_logs_scheduled ON one_to_one_logs(scheduled_date DESC);

-- ============================================================
-- visitor_log — visitor tracking
-- Source: 📋 VISITOR LOG sheet + apiAddVisitor / apiUpdateVisitor
-- ============================================================
CREATE TABLE visitor_log (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name  TEXT    NOT NULL,
  invited_by    UUID    REFERENCES members(id),
  visit_date    DATE    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','attended','no_show','joined')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_visitor_log_date    ON visitor_log(visit_date DESC);
CREATE INDEX idx_visitor_log_invited ON visitor_log(invited_by);

-- ============================================================
-- member_notes — per-member notes by MC or mentor
-- Source: 📝 MEMBER NOTES sheet
-- ============================================================
CREATE TABLE member_notes (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  note         TEXT    NOT NULL,
  author_role  TEXT,   -- 'mc', 'toomtam', etc.
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_member_notes_member ON member_notes(member_id);

-- ============================================================
-- renewals — membership renewal tracking
-- Source: 💳 RENEWAL sheet (col 1=name, col 3=expiry)
-- One active renewal record per member
-- ============================================================
CREATE TABLE renewals (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expiry_date  DATE    NOT NULL,
  extended_at  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id)
);

CREATE INDEX idx_renewals_expiry ON renewals(expiry_date ASC);

COMMENT ON TABLE renewals IS
  'Alert fires when expiry_date <= 45 days from today. '
  'UNIQUE(member_id) enforces one active record per member.';

-- ============================================================
-- broadcasts — LINE broadcast message history
-- Source: 📢 BROADCASTS sheet
-- ============================================================
CREATE TABLE broadcasts (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_role     TEXT    NOT NULL,
  title           TEXT,
  message         TEXT    NOT NULL,
  target_scope    TEXT    NOT NULL DEFAULT 'all',   -- 'all', team name, or member name
  sent_at         TIMESTAMPTZ DEFAULT now(),
  line_delivered  BOOLEAN NOT NULL DEFAULT false,
  recipient_count INT     DEFAULT 0
);

CREATE INDEX idx_broadcasts_sent_at ON broadcasts(sent_at DESC);

-- ============================================================
-- mc_messages — in-app messages from MC to mentors/growth
-- Source: apiSaveMCMessage / apiGetMessages
-- ============================================================
CREATE TABLE mc_messages (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  message      TEXT    NOT NULL,
  target_role  TEXT    NOT NULL DEFAULT 'all',   -- 'all' or specific role
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- message_reads — read state for MC messages
-- Source: apiGetReadMsgKeys / apiSetMsgRead
-- ============================================================
CREATE TABLE message_reads (
  role         TEXT    NOT NULL,
  message_key  TEXT    NOT NULL,
  read_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (role, message_key)
);

-- ============================================================
-- mc_assignments — MC creates assignments for mentors or members
-- Source: 📋 MC ASSIGNMENTS sheet
-- ============================================================
CREATE TABLE mc_assignments (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_team     TEXT    REFERENCES mentor_teams(name),
  member_id       UUID    REFERENCES members(id),
  assignment_text TEXT    NOT NULL,
  due_date        DATE,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mc_assignments_team   ON mc_assignments(mentor_team);
CREATE INDEX idx_mc_assignments_member ON mc_assignments(member_id);
CREATE INDEX idx_mc_assignments_unacked ON mc_assignments(acknowledged_at) WHERE acknowledged_at IS NULL;

-- ============================================================
-- growth_tasks — MC-to-mentor task board
-- Source: apiCreateGrowthTask / apiGetGrowthTasks / apiRespondGrowthTask
-- ============================================================
CREATE TABLE growth_tasks (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   TEXT    NOT NULL,     -- role e.g. 'mc'
  assigned_to  TEXT    NOT NULL,     -- role e.g. 'toomtam'
  member_id    UUID    REFERENCES members(id),
  task_text    TEXT    NOT NULL,
  response     TEXT,
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_growth_tasks_assigned ON growth_tasks(assigned_to);
CREATE INDEX idx_growth_tasks_pending  ON growth_tasks(responded_at) WHERE responded_at IS NULL;

-- ============================================================
-- power_teams — Power Team pairings
-- Source: ⚡ POWER TEAMS sheet
-- ============================================================
CREATE TABLE power_teams (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_a_id  UUID    NOT NULL REFERENCES members(id),
  member_b_id  UUID    NOT NULL REFERENCES members(id),
  synergy_type TEXT,   -- category of synergy
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  -- Canonical order: ensure no duplicate pairs (a,b) and (b,a)
  CHECK (member_a_id < member_b_id),
  UNIQUE(member_a_id, member_b_id)
);

CREATE INDEX idx_power_teams_a ON power_teams(member_a_id);
CREATE INDEX idx_power_teams_b ON power_teams(member_b_id);

-- ============================================================
-- cross_team_synergy — cross-team collaboration suggestions
-- Source: apiGetCrossTeamSynergy / apiSaveCrossTeamPair
-- ============================================================
CREATE TABLE cross_team_synergy (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_a_id  UUID    NOT NULL REFERENCES members(id),
  member_b_id  UUID    NOT NULL REFERENCES members(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  CHECK (member_a_id < member_b_id),
  UNIQUE(member_a_id, member_b_id)
);

-- ============================================================
-- sprint_board — mentor team sprint planning
-- Source: apiGetSprintBoard / apiSaveSprintPlan
-- One record per mentor team; content is flexible JSONB
-- ============================================================
CREATE TABLE sprint_board (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_team TEXT    NOT NULL REFERENCES mentor_teams(name),
  plan_data   JSONB   NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mentor_team)
);

-- ============================================================
-- chapter_revenue_goals — chapter revenue targets
-- Source: apiGetChapterRevenue / apiSetChapterGoal
-- ============================================================
CREATE TABLE chapter_revenue_goals (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_type   TEXT    NOT NULL,          -- 'tyfcb', 'referral', etc.
  target      NUMERIC(14,2),
  period      TEXT,                       -- 'MM/YY' or 4-digit year
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- new_member_checklist — onboarding checklist per new member
-- Source: apiGetNMChecklist / apiSaveNMCheckItem
-- ============================================================
CREATE TABLE new_member_checklist (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_key    TEXT    NOT NULL,
  is_done     BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, item_key)
);

CREATE INDEX idx_nm_checklist_member ON new_member_checklist(member_id);
