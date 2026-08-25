-- Major Upgrade Phase 2: evolve member_signals into a shared operational queue.
-- Source workflows remain canonical; this migration adds ownership, SLA,
-- optimistic concurrency and an immutable status/assignment history.

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE public.member_signals
  ADD COLUMN IF NOT EXISTS assigned_role TEXT,
  ADD COLUMN IF NOT EXISTS assigned_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_surface TEXT,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_by TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contacted_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_code TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.member_signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES public.member_signals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_ref TEXT,
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_signals_assignee
  ON public.member_signals(assigned_member_id, status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_member_signals_role_sla
  ON public.member_signals(assigned_role, status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_member_signal_events_timeline
  ON public.member_signal_events(signal_id, created_at DESC);

ALTER TABLE public.member_signal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_member_signal_events" ON public.member_signal_events;
CREATE POLICY "service_role_all_member_signal_events" ON public.member_signal_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_member_signal_defaults_and_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sla_due_at := COALESCE(NEW.sla_due_at, NEW.created_at + CASE NEW.priority
      WHEN 'urgent' THEN interval '4 hours'
      WHEN 'high' THEN interval '1 day'
      WHEN 'low' THEN interval '7 days'
      ELSE interval '3 days' END);
    NEW.version := 1;
    RETURN NEW;
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.assigned_member_id IS DISTINCT FROM NEW.assigned_member_id
     OR OLD.assigned_role IS DISTINCT FROM NEW.assigned_role THEN
    INSERT INTO public.member_signal_events(
      signal_id, event_type, actor_ref, from_status, to_status, metadata
    ) VALUES (
      OLD.id,
      CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_changed' ELSE 'assignment_changed' END,
      COALESCE(NEW.acknowledged_by, NEW.resolved_by, NEW.escalated_by, 'system'),
      OLD.status, NEW.status,
      jsonb_build_object(
        'from_assigned_role', OLD.assigned_role,
        'to_assigned_role', NEW.assigned_role,
        'from_assigned_member_id', OLD.assigned_member_id,
        'to_assigned_member_id', NEW.assigned_member_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_signal_defaults_and_audit ON public.member_signals;
CREATE TRIGGER trg_member_signal_defaults_and_audit
BEFORE INSERT OR UPDATE ON public.member_signals
FOR EACH ROW EXECUTE FUNCTION public.fn_member_signal_defaults_and_audit();

-- Existing open work receives an SLA from its original creation time.
UPDATE public.member_signals
SET sla_due_at = created_at + CASE priority
  WHEN 'urgent' THEN interval '4 hours'
  WHEN 'high' THEN interval '1 day'
  WHEN 'low' THEN interval '7 days'
  ELSE interval '3 days' END
WHERE sla_due_at IS NULL AND status IN ('new','acknowledged','in_progress');

COMMENT ON TABLE public.member_signal_events IS
  'Immutable audit history for member signal status and ownership changes.';
