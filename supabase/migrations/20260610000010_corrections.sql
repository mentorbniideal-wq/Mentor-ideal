-- ============================================================
-- Migration 010: Corrections & Missing Tables
-- Found after deep-reading WEBAPP.js:
--   1. dismissed_alerts  — was in PropertiesService, NOT a sheet
--   2. member_status     — col R (18) in mentor sheets
--   3. growth_referral_* — 'Growth' sheet for Growth Coordinator
--   4. absence_log cols  — need notice_date + team for full fidelity
-- ============================================================

-- ============================================================
-- 1. dismissed_alerts
--
-- In GAS: PropertiesService.getScriptProperties().getProperty('notif_dismissed')
--   → stored as JSON: { "key": timestamp_ms, ... }
--   → auto-purged after 7 days
--   → key format: "team|memberName|alertType"
--   → only MC role can dismiss/read
-- ============================================================
CREATE TABLE dismissed_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dismissed_by TEXT        NOT NULL DEFAULT 'mc',  -- role that dismissed (always 'mc')
  alert_key    TEXT        NOT NULL UNIQUE,         -- "team|memberName|alertType"
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup + cleanup of expired dismissals
CREATE INDEX idx_dismissed_alerts_key    ON dismissed_alerts(alert_key);
CREATE INDEX idx_dismissed_alerts_expiry ON dismissed_alerts(dismissed_at);

COMMENT ON TABLE dismissed_alerts IS
  'Replaces PropertiesService key "notif_dismissed" in WEBAPP.js:6402. '
  'alert_key format: "team|memberName|alertType" (e.g. "TOOMTAM|Ophat Taerattanachai|stale_case"). '
  'Auto-expire: Edge Function apiGetAlertCenter filters out rows where '
  'dismissed_at < now() - interval ''7 days''. '
  'A pg_cron job should purge expired rows nightly.';

-- Cleanup function (called by pg_cron nightly)
CREATE OR REPLACE FUNCTION fn_purge_expired_dismissals()
RETURNS INT LANGUAGE sql AS $$
  WITH deleted AS (
    DELETE FROM dismissed_alerts
    WHERE dismissed_at < now() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*)::INT FROM deleted;
$$;

-- ============================================================
-- 2. member_status — col R (column 18) in individual mentor sheets
--
-- In GAS: apiSaveStatus writes to sh.getRange(row, 18).setValue(status)
-- Observed values (from UI): 'Active', 'On Leave', 'Probation', 'Resigned'
-- This is mentor-team scoped metadata, not a global member flag.
-- ============================================================
ALTER TABLE members
  ADD COLUMN mentor_status TEXT DEFAULT NULL;

COMMENT ON COLUMN members.mentor_status IS
  'Mirrors col R (column 18) in mentor sheets. '
  'Set by apiSaveStatus. Values: Active, On Leave, Probation, Resigned, or NULL.';

-- ============================================================
-- 3. Growth sheet — Growth Coordinator's referral target tracker
--
-- In GAS: apiGetGrowthSheetData / apiAddGrowthMember / apiUpdateGrowthMember / apiMoveGrowthMember
-- Sheet structure:
--   Row type A: Group name (col A non-numeric) — e.g. "1.Developer"
--   Row type B: Column headers (col A blank)
--   Row type C: Member rows (col A = sequence integer)
--   Row type D: Total row (col A blank + "รวม" somewhere)
--
-- Fields: seq_no, name, nickname, target_thb, received_thb, membership_age, note, + extra cols (JSONB)
-- ============================================================

CREATE TABLE growth_referral_groups (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL UNIQUE,  -- e.g. "1.Developer", "NEW MEMBER", "ทั่วไป"
  sort_order  INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE growth_referral_members (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID    NOT NULL REFERENCES growth_referral_groups(id) ON DELETE CASCADE,
  member_id    UUID    REFERENCES members(id),    -- NULL if prospect (not yet in members table)
  raw_name     TEXT    NOT NULL,                  -- name as written in Growth sheet
  nickname     TEXT,
  seq_no       INT     NOT NULL DEFAULT 0,        -- ordering within group
  target_thb   NUMERIC(14,2) DEFAULT 0,           -- referral target in THB
  received_thb NUMERIC(14,2) DEFAULT 0,           -- referral received in THB
  membership_age TEXT,                            -- age/tenure label
  note         TEXT,
  extra_data   JSONB   DEFAULT '{}'::jsonb,       -- additional columns beyond standard fields
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_growth_ref_members_group  ON growth_referral_members(group_id);
CREATE INDEX idx_growth_ref_members_member ON growth_referral_members(member_id);

COMMENT ON TABLE growth_referral_groups IS
  'Power team groups in the Growth Coordinator sheet. '
  'Replaces the group-name rows in the "Growth" sheet.';

COMMENT ON TABLE growth_referral_members IS
  'Member tracking rows in the Growth sheet. '
  'member_id is NULL for prospects not yet enrolled as BNI members.';

-- ============================================================
-- 4. Patch line_absence_log — add notice_date for full fidelity
--
-- In GAS: _ABSENCE_SHEET columns include วันที่แจ้ง (notice date = created_at ✓)
-- and ทีม (team = derivable from members.mentor_team ✓)
-- created_at already covers notice_date — no extra columns needed.
-- However, the cancelled-absence flow (lineCancelAbsence) deletes the row.
-- In Supabase we soft-delete instead.
-- ============================================================
ALTER TABLE line_absence_log
  ADD COLUMN cancelled_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN line_absence_log.cancelled_at IS
  'Set when member uses "ยกเลิกลา" command (replaces GAS deleteRow behavior). '
  'Non-NULL = cancelled. Filter these out when showing active absence log.';

-- ============================================================
-- 5. Ensure settings has correct seed entries
-- ============================================================
INSERT INTO settings (key, value) VALUES
  ('MC_LINE_USER_ID',  ''),           -- set via apiSetMCLineId
  ('CHAPTER_GOAL',     '1000000000'), -- default 1B THB annual referral target
  ('APP_VERSION',      'v4.0'),
  ('LINE_CHANNEL_ID',  ''),           -- LINE Messaging API Channel ID
  ('ANTHROPIC_MODEL',  'claude-haiku-4-5-20251001')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE settings IS
  'Key-value config. Sensitive values (LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY) '
  'MUST be in Supabase Vault env vars, NOT in this table. '
  'Non-sensitive config only: MC_LINE_USER_ID, CHAPTER_GOAL, APP_VERSION, ANTHROPIC_MODEL.';
