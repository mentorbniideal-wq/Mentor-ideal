-- ============================================================
-- Migration 004: Check-in System
-- checkin_sessions, checkin_entries, ai_matching_results
-- Source: 📋 CHECKIN LOG sheet + CheckIn_System.js
-- ============================================================

-- ============================================================
-- checkin_sessions — one record per weekly BNI meeting
-- week_label format: 'ww/yyyy' e.g. '22/2026'
-- ============================================================
CREATE TABLE checkin_sessions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label   TEXT    UNIQUE NOT NULL,   -- used as idempotency key; re-upload replaces entries
  meeting_date DATE,
  imported_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checkin_sessions_date ON checkin_sessions(meeting_date DESC);

COMMENT ON TABLE checkin_sessions IS
  'One row per weekly BNI meeting. Re-importing same week_label replaces all entries '
  '(matches GAS deleteRow loop behavior).';

-- ============================================================
-- checkin_entries — individual attendance rows per session
-- member_id is nullable: sub or visitor may not be in the system
-- ============================================================
CREATE TABLE checkin_entries (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID    NOT NULL REFERENCES checkin_sessions(id) ON DELETE CASCADE,
  seq_no       INT,                        -- original order in check-in list
  member_id    UUID    REFERENCES members(id),   -- NULL for external visitors
  raw_name     TEXT    NOT NULL,           -- name as parsed from CSV/PDF (source of truth)
  status       TEXT    NOT NULL,           -- 'สมาชิก', 'ตัวแทน', 'ผู้เยี่ยมชม'
  sub_for      TEXT,                       -- name of person being substituted
  looking_for  TEXT,                       -- business request for 1-2-1 matching
  mentor_team  TEXT                        -- denormalized for quick mentor-view queries
);

CREATE INDEX idx_checkin_entries_session ON checkin_entries(session_id);
CREATE INDEX idx_checkin_entries_member  ON checkin_entries(member_id);

COMMENT ON COLUMN checkin_entries.member_id IS
  'NULL when attendee is not in the members table (e.g. external visitor or unknown sub).';

-- ============================================================
-- ai_matching_results — cached AI 1-2-1 match suggestions
-- One result set per session; re-running AI overwrites previous
-- ============================================================
CREATE TABLE ai_matching_results (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID    NOT NULL REFERENCES checkin_sessions(id) ON DELETE CASCADE,
  matches    JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- array of {person_a, person_b, reason, action, priority}
  summary    TEXT,
  model_used TEXT,                                    -- e.g. 'claude-haiku-4-5-20251001'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id)                                  -- one result per session
);

COMMENT ON TABLE ai_matching_results IS
  'Cached AI 1-2-1 match suggestions. Stored in Supabase instead of re-calling Anthropic on each view. '
  'Edge Function calls Anthropic API then upserts here.';
