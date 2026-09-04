-- LT term handover workflow.
-- Additive: preserves the existing chapter-wide checklist and all historical terms.

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS access_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_only_after TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.lt_role_handover_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_term_id UUID REFERENCES public.lt_terms(id) ON DELETE SET NULL,
  to_term_id UUID NOT NULL REFERENCES public.lt_terms(id) ON DELETE CASCADE,
  lt_role TEXT NOT NULL,
  item_key TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  outgoing_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  incoming_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  outgoing_accepted_at TIMESTAMPTZ,
  incoming_accepted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','ready','blocked','not_applicable')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(to_term_id, lt_role, item_key)
);

CREATE INDEX IF NOT EXISTS idx_lt_role_handover_term_status
  ON public.lt_role_handover_items(to_term_id, status, lt_role);

CREATE TABLE IF NOT EXISTS public.lt_term_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES public.lt_terms(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('baseline','handover','closing')),
  snapshot JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(term_id, snapshot_type)
);

ALTER TABLE public.lt_role_handover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_term_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lt_role_handover_items, public.lt_term_snapshots FROM anon, authenticated;

COMMENT ON TABLE public.lt_role_handover_items IS
  'Role-specific LT handover with explicit outgoing and incoming acknowledgement.';
COMMENT ON TABLE public.lt_term_snapshots IS
  'Immutable term facts used for handover evidence and term-over-term comparison.';

CREATE OR REPLACE FUNCTION public.prevent_lt_term_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'LT term snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_lt_term_snapshot_mutation ON public.lt_term_snapshots;
CREATE TRIGGER trg_prevent_lt_term_snapshot_mutation
BEFORE UPDATE OR DELETE ON public.lt_term_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_lt_term_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.fn_apply_lt_access_lifecycle(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE(activated INTEGER, restricted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activated INTEGER := 0;
  v_restricted INTEGER := 0;
BEGIN
  UPDATE role_assignments
  SET access_status = 'active', updated_at = p_now
  WHERE access_status <> 'revoked'
    AND access_starts_at IS NOT NULL
    AND access_starts_at <= p_now
    AND (access_expires_at IS NULL OR access_expires_at >= p_now)
    AND access_status <> 'active';
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  UPDATE role_assignments
  SET access_status = 'suspended', updated_at = p_now
  WHERE role <> 'admin'
    AND COALESCE(is_admin, false) = false
    AND access_status = 'active'
    AND access_expires_at IS NOT NULL
    AND access_expires_at < p_now;
  GET DIAGNOSTICS v_restricted = ROW_COUNT;

  RETURN QUERY SELECT v_activated, v_restricted;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_apply_lt_access_lifecycle(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_lt_access_lifecycle(TIMESTAMPTZ) TO service_role;
