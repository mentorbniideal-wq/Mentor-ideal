-- ============================================================
-- Migration 007: System Tables
-- settings, app_usage, seat_map
-- ============================================================

-- ============================================================
-- settings — key-value configuration store
-- Replaces: ⚙️ SETTINGS sheet (col A=key, col B=value)
-- Used for: PIN overrides, CURRENT_MONTH, feature flags, LINE tokens
-- ============================================================
CREATE TABLE settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: current month label for the app
INSERT INTO settings (key, value) VALUES
  ('CURRENT_MONTH', TO_CHAR(now(), 'MM/YY'));

COMMENT ON TABLE settings IS
  'Key-value store replacing ⚙️ SETTINGS sheet. '
  'Sensitive values (LINE_TOKEN, ANTHROPIC_API_KEY) must be stored in '
  'Supabase Vault / Edge Function env vars instead — not in this table.';

-- ============================================================
-- app_usage — usage analytics log
-- Source: 📱 APP USAGE sheet
-- Col order in GAS: Date, DayTH, Time, Role, Team, Platform, Action, Detail
-- ============================================================
CREATE TABLE app_usage (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  role       TEXT,
  team       TEXT,
  platform   TEXT    CHECK (platform IN ('mobile', 'desktop', 'line')),
  action     TEXT,
  detail     TEXT
);

CREATE INDEX idx_app_usage_logged_at ON app_usage(logged_at DESC);
CREATE INDEX idx_app_usage_role      ON app_usage(role);

COMMENT ON TABLE app_usage IS
  'Usage analytics. Written on login and major actions. '
  'Used by apiGetUsageLog to surface engagement patterns.';

-- ============================================================
-- seat_map — weekly meeting seat arrangement
-- Source: apiGetSeatMap
-- Stored as JSONB to accommodate flexible seating layouts
-- ============================================================
CREATE TABLE seat_map (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label  TEXT    UNIQUE NOT NULL,   -- 'ww/yyyy' same key as checkin_sessions
  layout      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE seat_map IS
  'Weekly seating layout. week_label matches checkin_sessions.week_label.';

-- ============================================================
-- team_notifs — mentor team notification queue
-- Source: apiGetTeamNotifs / apiAckTeamNotifs
-- ============================================================
CREATE TABLE team_notifs (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_team  TEXT    NOT NULL,
  notif_type   TEXT    NOT NULL,   -- 'score_drop', 'core_issue_stale', etc.
  member_id    UUID    REFERENCES members(id),
  message      TEXT    NOT NULL,
  is_acked     BOOLEAN NOT NULL DEFAULT false,
  acked_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_team_notifs_team   ON team_notifs(mentor_team, is_acked);
CREATE INDEX idx_team_notifs_unread ON team_notifs(mentor_team) WHERE is_acked = false;
