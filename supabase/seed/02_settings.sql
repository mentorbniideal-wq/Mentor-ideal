-- ============================================================
-- Seed: application settings
-- Run after migration 001. Safe to re-run (upsert).
-- ============================================================

INSERT INTO settings (key, value) VALUES
  -- Current scoring period (MM/YY format — update each month)
  ('CURRENT_MONTH',       TO_CHAR(now(), 'MM/YY')),

  -- Chapter revenue goal (฿) for dashboard display
  ('CHAPTER_GOAL',        '1000000000'),

  -- MC's LINE User ID — REQUIRED for notification delivery to MC
  -- Get from LINE Developers Console or have MC send "ทดสอบ" and check logs
  ('MC_LINE_USER_ID',     ''),

  -- LINE Messaging API channel ID (from LINE Developers Console)
  ('LINE_CHANNEL_ID',     ''),

  -- Anthropic model for AI features (check-in PDF parsing, 1-2-1 matching)
  ('ANTHROPIC_MODEL',     'claude-haiku-4-5-20251001'),

  -- App version (update on major releases)
  ('APP_VERSION',         '2.0.0'),

  -- Grace period for renewal warnings (days before expiry to start notifying)
  ('RENEWAL_WARN_DAYS',   '45'),

  -- Stale Core Issue threshold (days before flagging as stale)
  ('STALE_CASE_DAYS',     '14'),

  -- Alert dismissal TTL (days)
  ('ALERT_DISMISS_DAYS',  '7'),

  -- Parallel run flag — set to 'true' to enable dual-write to GAS during migration
  -- Set to 'false' after full cutover
  ('PARALLEL_RUN',        'false')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── Verify ────────────────────────────────────────────────────
-- SELECT key, value FROM settings ORDER BY key;
