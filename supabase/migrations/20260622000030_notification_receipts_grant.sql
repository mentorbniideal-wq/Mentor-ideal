-- Ensure notification_receipts table exists and is accessible via PostgREST
-- Migration 24 created it but the schema cache may not have picked it up

CREATE TABLE IF NOT EXISTS public.notification_receipts (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_key   TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  PRIMARY KEY (notification_id, recipient_key)
);

ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;

-- Allow service_role (used by Edge Functions) full access
GRANT ALL ON public.notification_receipts TO service_role;

DROP POLICY IF EXISTS "service_role_all_notif_receipts" ON public.notification_receipts;
CREATE POLICY "service_role_all_notif_receipts"
  ON public.notification_receipts FOR ALL TO service_role USING (true);

-- Reload PostgREST schema cache so the table is immediately visible
SELECT pg_notify('pgrst', 'reload schema');
