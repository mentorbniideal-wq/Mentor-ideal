-- Phase 2C batch 1: make LT term creation tenant-scoped.
-- The former single-active-term index is replaced only after Phase 2B backfill.

DROP INDEX IF EXISTS public.idx_lt_terms_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lt_terms_one_active_per_chapter
  ON public.lt_terms(chapter_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.fn_create_lt_term_scoped(
  p_chapter_id UUID,
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
  IF p_chapter_id IS NULL OR p_name IS NULL OR btrim(p_name) = '' OR p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'Invalid Chapter or LT term';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chapter_profiles WHERE id = p_chapter_id AND is_active = true) THEN
    RAISE EXCEPTION 'Chapter is not active';
  END IF;
  SELECT id INTO v_previous FROM public.lt_terms
    WHERE chapter_id = p_chapter_id AND status = 'active' LIMIT 1;
  INSERT INTO public.lt_terms(chapter_id, name, starts_on, ends_on, status, created_by)
  VALUES (p_chapter_id, btrim(p_name), p_starts_on, p_ends_on, 'draft', p_actor)
  RETURNING id INTO v_new;

  UPDATE public.lt_terms SET status = 'completed', updated_at = now()
    WHERE id = v_previous AND chapter_id = p_chapter_id;
  UPDATE public.passport_lt_assignments SET is_active = false, updated_at = now()
    WHERE chapter_id = p_chapter_id AND is_active = true;
  UPDATE public.lt_terms SET status = 'active', updated_at = now()
    WHERE id = v_new AND chapter_id = p_chapter_id;

  IF p_copy_previous AND v_previous IS NOT NULL THEN
    INSERT INTO public.passport_lt_assignments(
      chapter_id, lt_role, assigned_member_id, assigned_name, fallback_member_id,
      term_id, term_start, term_end, notification_scopes, is_active, notes
    )
    SELECT p_chapter_id, lt_role, assigned_member_id, assigned_name, fallback_member_id,
      v_new, p_starts_on, p_ends_on, notification_scopes, true,
      concat('คัดลอกจากวาระก่อน', CASE WHEN notes IS NOT NULL THEN ' · ' || notes ELSE '' END)
    FROM public.passport_lt_assignments
    WHERE chapter_id = p_chapter_id AND term_id = v_previous;
  END IF;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_lt_term_scoped(UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_lt_term_scoped(UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) TO service_role;

COMMENT ON FUNCTION public.fn_create_lt_term_scoped(UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) IS
  'Creates and transitions exactly one LT term within the server-derived Chapter scope.';
