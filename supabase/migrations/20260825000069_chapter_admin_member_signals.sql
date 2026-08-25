-- Chapter Admin role and cross-module member signals for LT follow-up.

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.role_assignments DROP CONSTRAINT IF EXISTS role_assignments_role_check;
ALTER TABLE public.role_assignments ADD CONSTRAINT role_assignments_role_check
  CHECK (role IN ('admin','mc','toomtam','aof','draft','phai','amp','growth'));

-- Pete moves from the operational MC seat to Chapter Admin. Match the existing
-- display label rather than an email so no personal identifier is embedded.
UPDATE public.role_assignments
SET role = 'admin', display_name = 'Chapter Admin', is_admin = true,
    is_mc = true, admin_edit_access = true,
    admin_sections = ARRAY['dashboard','members','issues','checkin','revenue','broadcast']::TEXT[]
WHERE role = 'mc' AND display_name ILIKE 'Pete%';

CREATE TABLE IF NOT EXISTS public.member_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('goal','visitor','renewal','training','member_help')),
  subject_type TEXT,
  subject_id TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  target_roles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','in_progress','resolved','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  consent_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_signals_queue
  ON public.member_signals(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_signals_member
  ON public.member_signals(member_id, signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_signals_target_roles
  ON public.member_signals USING GIN(target_roles);

ALTER TABLE public.member_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_member_signals" ON public.member_signals;
CREATE POLICY "service_role_all_member_signals" ON public.member_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.member_signals IS
  'Consent-aware signals from LIFF actions routed to the responsible LT roles; source workflows remain canonical.';
