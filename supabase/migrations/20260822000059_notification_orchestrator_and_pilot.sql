-- Central message ledger metadata and safe pilot controls.
ALTER TABLE public.line_message_deliveries
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS trigger_name TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_line_delivery_budget_month
  ON public.line_message_deliveries(module, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_line_delivery_member_caps
  ON public.line_message_deliveries(member_id, sent_at DESC)
  WHERE status = 'sent';

INSERT INTO public.settings(key,value) VALUES
  ('ONE_TO_ONE_EMERGENCY_STOP','false'),
  ('ONE_TO_ONE_PILOT_MEMBER_IDS','[]')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.line_message_deliveries.suppression_reason IS
  'Explainable reason why the central notification guard did not send a message.';
