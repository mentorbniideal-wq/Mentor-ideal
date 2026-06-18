-- Migration 020 (2026-06-18): Renewal follow-up workflow
-- Tracks contact, renewal decision, payment and completion with an audit trail.

ALTER TABLE renewals
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'pending_contact',
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contacted_by TEXT,
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_by TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by TEXT,
  ADD COLUMN IF NOT EXISTS decline_reason TEXT;

ALTER TABLE renewals DROP CONSTRAINT IF EXISTS renewals_workflow_status_check;
ALTER TABLE renewals ADD CONSTRAINT renewals_workflow_status_check
  CHECK (workflow_status IN (
    'pending_contact',
    'contacted',
    'confirmed_renew',
    'paid',
    'completed',
    'declined'
  ));

CREATE INDEX IF NOT EXISTS idx_renewals_workflow_status
  ON renewals(workflow_status, expiry_date);

CREATE TABLE IF NOT EXISTS renewal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES renewals(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_events_member
  ON renewal_events(member_id, created_at DESC);

ALTER TABLE renewal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_renewal_events" ON renewal_events;
CREATE POLICY "service_role_all_renewal_events"
  ON renewal_events FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON COLUMN renewals.workflow_status IS
  'pending_contact -> contacted -> confirmed_renew -> paid -> completed, or declined';
COMMENT ON TABLE renewal_events IS
  'Immutable audit history for renewal workflow status changes.';
