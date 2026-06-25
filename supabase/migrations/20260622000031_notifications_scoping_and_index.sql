-- Migration 031: notifications team scoping + performance indexes
--
-- Problems fixed:
--  1. notification_receipts had no index on recipient_key — every getNotifications
--     call was a full scan of the PK (notification_id, recipient_key) in the wrong order.
--  2. notifications had no audience filter — any authenticated role could see
--     renewal_declined alerts for members from other teams.

-- ── Index: fast recipient-scoped receipt lookup ──────────────
CREATE INDEX IF NOT EXISTS idx_notif_receipts_recipient
  ON public.notification_receipts(recipient_key);

-- ── Column: target_audience (NULL = visible to all roles) ────
-- Values are team names ('TOOMTAM', 'AMP', …) or the string 'mc'.
-- NULL means "broadcast to all authenticated users" (chapter-wide alerts).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_audience TEXT[] DEFAULT NULL;

-- GIN index for array-containment filter (@> in PostgREST = cs operator)
CREATE INDEX IF NOT EXISTS idx_notifications_audience
  ON public.notifications USING gin(target_audience)
  WHERE target_audience IS NOT NULL;
