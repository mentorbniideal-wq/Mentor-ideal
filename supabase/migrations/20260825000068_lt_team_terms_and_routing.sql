-- LT Team: six-month terms and role-based notification routing.
-- Extends the existing Passport LT assignment source of truth.

CREATE TABLE IF NOT EXISTS public.lt_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (starts_on, ends_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lt_terms_one_active
  ON public.lt_terms(status) WHERE status = 'active';

ALTER TABLE public.passport_lt_assignments
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.lt_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notification_scopes TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_passport_lt_assignments_term
  ON public.passport_lt_assignments(term_id, is_active, lt_role);

ALTER TABLE public.lt_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_lt_terms" ON public.lt_terms;
CREATE POLICY "service_role_all_lt_terms" ON public.lt_terms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bootstrap the current Apr-Sep 2026 term without replacing any assignment.
INSERT INTO public.lt_terms (name, starts_on, ends_on, status, created_by)
VALUES ('วาระ เม.ย.–ก.ย. 2569', '2026-04-01', '2026-09-30', 'active', 'migration')
ON CONFLICT (starts_on, ends_on) DO UPDATE
SET status = CASE WHEN public.lt_terms.status = 'draft' THEN 'active' ELSE public.lt_terms.status END,
    updated_at = now();

UPDATE public.passport_lt_assignments a
SET term_id = t.id,
    term_start = COALESCE(a.term_start, t.starts_on),
    term_end = COALESCE(a.term_end, t.ends_on),
    notification_scopes = CASE a.lt_role
      WHEN 'Membership Committee' THEN ARRAY['absence','renewal']::TEXT[]
      WHEN 'Secretary/Treasurer' THEN ARRAY['absence']::TEXT[]
      WHEN 'Visitor Host' THEN ARRAY['visitor']::TEXT[]
      WHEN 'Event Coordinator' THEN ARRAY['visitor']::TEXT[]
      WHEN 'Mentor Coordinator' THEN ARRAY['member_help','new_member']::TEXT[]
      ELSE a.notification_scopes
    END,
    updated_at = now()
FROM public.lt_terms t
WHERE t.status = 'active' AND a.is_active = true AND a.term_id IS NULL;

COMMENT ON TABLE public.lt_terms IS
  'Six-month LT leadership terms. Exactly one term is active at a time.';
COMMENT ON COLUMN public.passport_lt_assignments.notification_scopes IS
  'Operational events routed to the active holder of this LT role.';

CREATE OR REPLACE FUNCTION public.fn_create_lt_term(
  p_name TEXT,
  p_starts_on DATE,
  p_ends_on DATE,
  p_copy_previous BOOLEAN DEFAULT true,
  p_actor TEXT DEFAULT 'mc'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous UUID;
  v_new UUID;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' OR p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'Invalid LT term';
  END IF;
  SELECT id INTO v_previous FROM lt_terms WHERE status = 'active' LIMIT 1;
  INSERT INTO lt_terms(name, starts_on, ends_on, status, created_by)
  VALUES (btrim(p_name), p_starts_on, p_ends_on, 'draft', p_actor)
  RETURNING id INTO v_new;

  UPDATE lt_terms SET status = 'completed', updated_at = now() WHERE id = v_previous;
  UPDATE passport_lt_assignments SET is_active = false, updated_at = now()
  WHERE is_active = true;
  UPDATE lt_terms SET status = 'active', updated_at = now() WHERE id = v_new;

  IF p_copy_previous AND v_previous IS NOT NULL THEN
    INSERT INTO passport_lt_assignments(
      lt_role, assigned_member_id, assigned_name, fallback_member_id,
      term_id, term_start, term_end, notification_scopes, is_active, notes
    )
    SELECT lt_role, assigned_member_id, assigned_name, fallback_member_id,
      v_new, p_starts_on, p_ends_on, notification_scopes, true,
      concat('คัดลอกจากวาระก่อน', CASE WHEN notes IS NOT NULL THEN ' · ' || notes ELSE '' END)
    FROM passport_lt_assignments
    WHERE term_id = v_previous;
  END IF;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_lt_term(TEXT, DATE, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_lt_term(TEXT, DATE, DATE, BOOLEAN, TEXT) TO service_role;
