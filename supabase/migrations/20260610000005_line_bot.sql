-- ============================================================
-- Migration 005: LINE Bot Tables
-- Replaces: PropertiesService keys + 📱 LINE MEMBERS sheet
--
-- CRITICAL: line_members must be populated from existing sheet data
--           BEFORE going live — existing users must NOT need to re-register.
-- ============================================================

-- ============================================================
-- line_members — LINE userId → member mapping
-- Source: 📱 LINE MEMBERS sheet (userId, member name, registered_at)
-- Data from this sheet MUST be migrated before cutover.
-- ============================================================
CREATE TABLE line_members (
  line_user_id  TEXT    PRIMARY KEY,
  member_id     UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_members_member ON line_members(member_id);

COMMENT ON TABLE line_members IS
  'LINE userId → member mapping. '
  'MUST be seeded from existing 📱 LINE MEMBERS sheet before cutover. '
  'Existing registrations must be preserved to avoid forcing all members to re-register.';

-- ============================================================
-- line_bot_state — replaces PropertiesService keys
-- Keys in GAS: LINE_REG_{userId}, LINE_ABS_{userId}, LINE_121_AWAIT_OUT_{userId}
-- These are transient registration/flow states; safe to start fresh after cutover.
-- ============================================================
CREATE TABLE line_bot_state (
  line_user_id  TEXT NOT NULL,
  state_key     TEXT NOT NULL,   -- 'registration', 'absence', '121_outcome'
  state_value   TEXT NOT NULL,   -- e.g. 'AWAITING', 'CONFIRM:Archara Pagarat', 'CHOOSE:name1|name2'
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (line_user_id, state_key)
);

COMMENT ON TABLE line_bot_state IS
  'Transient LINE Bot conversation state. Replaces PropertiesService. '
  'Safe to start empty on cutover — in-flight registrations will just restart.';

-- ============================================================
-- line_issues — member-reported problems via LINE Bot
-- Source: 📋 LINE ISSUES sheet
-- ============================================================
CREATE TABLE line_issues (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  issue_text      TEXT    NOT NULL,
  reported_at     TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  mentor_response TEXT
);

CREATE INDEX idx_line_issues_member   ON line_issues(member_id);
CREATE INDEX idx_line_issues_open     ON line_issues(resolved_at) WHERE resolved_at IS NULL;

-- ============================================================
-- line_absence_log — ลา / ส่ง sub records from LINE Bot
-- Replaces the _ABSENCE_SHEET ('📱 ABSENCE LOG') in WEBAPP.js
-- ============================================================
CREATE TABLE line_absence_log (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  absence_type TEXT    NOT NULL CHECK (absence_type IN ('ลา', 'ส่ง sub')),
  sub_name     TEXT,           -- populated when absence_type = 'ส่ง sub'
  reason       TEXT,
  week_date    DATE,           -- the Friday meeting date this covers
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_line_absence_member ON line_absence_log(member_id);
CREATE INDEX idx_line_absence_date   ON line_absence_log(week_date DESC);

-- ============================================================
-- biz_profiles — member business profile for LINE Bot "แนะนำ" command
-- Also used by AI 1-2-1 matching and RuleMatching
-- ============================================================
CREATE TABLE biz_profiles (
  member_id    UUID    PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  description  TEXT    NOT NULL,   -- e.g. 'ประกันชีวิต สุขภาพ'
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- line_goals — member goals set via LINE Bot "เป้า" command
-- ============================================================
CREATE TABLE line_goals (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  goal_type   TEXT    NOT NULL,   -- 'ref', 'visitor', 'oto', 'ceu', 'tyfb'
  target      NUMERIC(10,1) NOT NULL,
  set_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, goal_type)
);

-- ============================================================
-- line_notif_settings — per-member notification preferences
-- Replaces PropertiesService keys: LINE_NOTIF_{userId}_{type}
-- ============================================================
CREATE TABLE line_notif_settings (
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  notif_type   TEXT    NOT NULL,   -- 'nudge', 'score', 'reminder', etc.
  is_muted     BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (member_id, notif_type)
);

-- ============================================================
-- onboarding_schedule — new member LINE onboarding program
-- Source: apiEnrollOnboarding / apiRemoveOnboarding
-- ============================================================
CREATE TABLE onboarding_schedule (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  removed_at  TIMESTAMPTZ,
  UNIQUE(member_id)
);

-- ============================================================
-- onboarding_messages — configurable weekly message templates
-- Source: apiGetOnboardingMessages / apiSaveOnboardingMessage
-- ============================================================
CREATE TABLE onboarding_messages (
  week_number   INT   PRIMARY KEY CHECK (week_number >= 1 AND week_number <= 12),
  message_text  TEXT  NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- onboarding_sends — track which week has been sent to whom
-- ============================================================
CREATE TABLE onboarding_sends (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_number  INT     NOT NULL,
  sent_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, week_number)
);

COMMENT ON TABLE onboarding_sends IS
  'Idempotency guard: prevents sending the same week message twice to a member.';
