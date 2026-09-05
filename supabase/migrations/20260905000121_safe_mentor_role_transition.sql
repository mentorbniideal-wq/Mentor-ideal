-- Safe, auditable LT role transitions and same-person term renewals.
-- The existing durable Mentor Team codes remain unchanged for compatibility.

CREATE OR REPLACE FUNCTION public.fn_transition_lt_assignment(
  p_lt_role TEXT,
  p_incoming_member_id UUID,
  p_fallback_member_id UUID DEFAULT NULL,
  p_expected_outgoing_member_id UUID DEFAULT NULL,
  p_actor TEXT DEFAULT 'Chapter Admin'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term public.lt_terms%ROWTYPE;
  v_assignment public.passport_lt_assignments%ROWTYPE;
  v_outgoing UUID;
  v_incoming_name TEXT;
  v_team_code TEXT;
  v_access_role TEXT;
  v_transition TEXT;
  v_old_access_suspended INTEGER := 0;
  v_new_access_activated INTEGER := 0;
  v_has_other_mentor_position BOOLEAN := false;
BEGIN
  SELECT * INTO v_term FROM public.lt_terms WHERE status = 'active' FOR UPDATE;
  IF v_term.id IS NULL THEN RAISE EXCEPTION 'No active LT term'; END IF;

  SELECT * INTO v_assignment
  FROM public.passport_lt_assignments
  WHERE term_id = v_term.id AND lt_role = p_lt_role AND is_active = true
  FOR UPDATE;
  IF v_assignment.id IS NULL THEN RAISE EXCEPTION 'Active LT assignment not found'; END IF;

  v_outgoing := v_assignment.assigned_member_id;
  IF v_outgoing IS DISTINCT FROM p_expected_outgoing_member_id THEN
    RAISE EXCEPTION 'LT assignment changed after preview';
  END IF;
  IF p_incoming_member_id IS NOT NULL AND p_incoming_member_id = p_fallback_member_id THEN
    RAISE EXCEPTION 'Primary and fallback must be different members';
  END IF;

  IF p_incoming_member_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(nickname), ''), NULLIF(btrim(name), ''))
      INTO v_incoming_name
    FROM public.members
    WHERE id = p_incoming_member_id AND COALESCE(is_archived, false) = false;
    IF v_incoming_name IS NULL THEN RAISE EXCEPTION 'Incoming member not found'; END IF;
  END IF;

  v_transition := CASE
    WHEN v_outgoing IS NOT DISTINCT FROM p_incoming_member_id AND p_incoming_member_id IS NOT NULL THEN 'continued'
    WHEN v_outgoing IS NULL AND p_incoming_member_id IS NOT NULL THEN 'assigned'
    WHEN v_outgoing IS NOT NULL AND p_incoming_member_id IS NULL THEN 'vacated'
    ELSE 'transferred'
  END;

  UPDATE public.passport_lt_assignments
  SET assigned_member_id = p_incoming_member_id,
      assigned_name = v_incoming_name,
      fallback_member_id = p_fallback_member_id,
      term_start = v_term.starts_on,
      term_end = v_term.ends_on,
      updated_at = now()
  WHERE id = v_assignment.id;

  IF p_lt_role LIKE 'Mentor Team · %' THEN
    v_team_code := substring(p_lt_role FROM length('Mentor Team · ') + 1);
    v_access_role := CASE v_team_code
      WHEN 'TOOMTAM' THEN 'toomtam' WHEN 'Aof' THEN 'aof'
      WHEN 'Draft' THEN 'draft' WHEN 'PHAI' THEN 'phai'
      WHEN 'AMP' THEN 'amp' ELSE NULL END;
    UPDATE public.mentor_teams
    SET leader_name = COALESCE(v_incoming_name, v_team_code),
        leader_member_id = p_incoming_member_id,
        display_name = CASE WHEN v_incoming_name IS NULL THEN name ELSE 'ทีม ' || v_incoming_name END,
        active_term_id = v_term.id,
        updated_at = now()
    WHERE name = v_team_code;
  ELSIF p_lt_role = 'Mentor Co.' THEN
    v_access_role := 'mc';
  ELSIF p_lt_role LIKE 'Mentor Support %' THEN
    v_access_role := 'mentor_support';
  END IF;

  IF v_access_role IS NOT NULL AND v_outgoing IS DISTINCT FROM p_incoming_member_id AND v_outgoing IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.passport_lt_assignments
      WHERE term_id = v_term.id AND is_active = true
        AND assigned_member_id = v_outgoing AND id <> v_assignment.id
        AND (lt_role = 'Mentor Co.' OR lt_role LIKE 'Mentor Team · %' OR lt_role LIKE 'Mentor Support %')
    ) INTO v_has_other_mentor_position;
    IF NOT v_has_other_mentor_position THEN
      UPDATE public.role_assignments
      SET access_status = 'suspended', access_expires_at = now(), updated_at = now()
      WHERE member_id = v_outgoing AND role <> 'admin' AND COALESCE(is_admin, false) = false
        AND access_status = 'active';
      GET DIAGNOSTICS v_old_access_suspended = ROW_COUNT;
    END IF;
  END IF;

  IF v_access_role IS NOT NULL AND p_incoming_member_id IS NOT NULL THEN
    UPDATE public.role_assignments
    SET role = v_access_role,
        display_name = v_incoming_name,
        team_name = CASE WHEN v_access_role = 'mc' THEN 'Mentor Co.' ELSE v_team_code END,
        is_mc = (v_access_role = 'mc'),
        is_mentor = (v_access_role <> 'mc'),
        access_status = 'active', access_starts_at = now(),
        access_expires_at = (v_term.ends_on::TEXT || 'T23:59:59+07:00')::TIMESTAMPTZ,
        term_id = v_term.id, updated_at = now()
    WHERE member_id = p_incoming_member_id AND role <> 'admin' AND COALESCE(is_admin, false) = false;
    GET DIAGNOSTICS v_new_access_activated = ROW_COUNT;
  END IF;

  UPDATE public.passport_sessions
  SET assigned_lt_member_id = p_incoming_member_id,
      assigned_lt_name = v_incoming_name,
      updated_at = now()
  WHERE lt_role = p_lt_role AND status IN ('scheduled', 'notified');

  INSERT INTO public.chapter_audit_events(
    event_type, actor_role, actor_ref, subject_type, subject_ref, metadata
  ) VALUES (
    'lt_role_' || v_transition, 'admin', p_actor, 'lt_assignment', v_assignment.id::TEXT,
    jsonb_build_object(
      'term_id', v_term.id, 'lt_role', p_lt_role,
      'outgoing_member_id', v_outgoing, 'incoming_member_id', p_incoming_member_id,
      'old_access_suspended', v_old_access_suspended,
      'new_access_activated', v_new_access_activated
    )
  );

  RETURN jsonb_build_object(
    'transition', v_transition, 'term_id', v_term.id,
    'outgoing_member_id', v_outgoing, 'incoming_member_id', p_incoming_member_id,
    'incoming_name', v_incoming_name,
    'old_access_suspended', v_old_access_suspended,
    'new_access_activated', v_new_access_activated,
    'needs_mobile_invite', p_incoming_member_id IS NOT NULL AND v_access_role IS NOT NULL AND v_new_access_activated = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_transition_lt_assignment(TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_transition_lt_assignment(TEXT, UUID, UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.fn_transition_lt_assignment(TEXT, UUID, UUID, UUID, TEXT) IS
  'Atomically transfers or renews an LT holder, updates Mentor team identity, applies access lifecycle, and writes an audit event.';

-- Replace the original term creator additively so copied holders are genuine
-- continuations: their existing account remains active through the new term.
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
  v_continued INTEGER := 0;
  v_suspended INTEGER := 0;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' OR p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'Invalid LT term';
  END IF;
  SELECT id INTO v_previous FROM public.lt_terms WHERE status = 'active' FOR UPDATE;
  INSERT INTO public.lt_terms(name, starts_on, ends_on, status, created_by)
  VALUES (btrim(p_name), p_starts_on, p_ends_on, 'draft', p_actor)
  RETURNING id INTO v_new;

  UPDATE public.lt_terms SET status = 'completed', updated_at = now() WHERE id = v_previous;
  UPDATE public.passport_lt_assignments SET is_active = false, updated_at = now()
  WHERE is_active = true;
  UPDATE public.lt_terms SET status = 'active', updated_at = now() WHERE id = v_new;

  IF p_copy_previous AND v_previous IS NOT NULL THEN
    INSERT INTO public.passport_lt_assignments(
      lt_role, assigned_member_id, assigned_name, fallback_member_id,
      term_id, term_start, term_end, notification_scopes, is_active, notes
    )
    SELECT lt_role, assigned_member_id, assigned_name, fallback_member_id,
      v_new, p_starts_on, p_ends_on, notification_scopes, true,
      concat('อยู่ต่อจากวาระก่อน', CASE WHEN notes IS NOT NULL THEN ' · ' || notes ELSE '' END)
    FROM public.passport_lt_assignments WHERE term_id = v_previous;

    UPDATE public.role_assignments ra
    SET term_id = v_new, access_status = 'active', access_starts_at = now(),
        access_expires_at = (p_ends_on::TEXT || 'T23:59:59+07:00')::TIMESTAMPTZ,
        updated_at = now()
    WHERE ra.role <> 'admin' AND COALESCE(ra.is_admin, false) = false
      AND EXISTS (
        SELECT 1 FROM public.passport_lt_assignments a
        WHERE a.term_id = v_new AND a.is_active = true AND a.assigned_member_id = ra.member_id
      );
    GET DIAGNOSTICS v_continued = ROW_COUNT;
  ELSIF v_previous IS NOT NULL THEN
    UPDATE public.role_assignments ra
    SET access_status = 'suspended', access_expires_at = now(), updated_at = now()
    WHERE ra.role <> 'admin' AND COALESCE(ra.is_admin, false) = false
      AND EXISTS (
        SELECT 1 FROM public.passport_lt_assignments a
        WHERE a.term_id = v_previous AND a.assigned_member_id = ra.member_id
      );
    GET DIAGNOSTICS v_suspended = ROW_COUNT;
  END IF;

  INSERT INTO public.chapter_audit_events(
    event_type, actor_role, actor_ref, subject_type, subject_ref, metadata
  ) VALUES (
    'lt_term_activated', 'admin', p_actor, 'lt_term', v_new::TEXT,
    jsonb_build_object('previous_term_id', v_previous, 'copy_previous', p_copy_previous,
      'continued_access_count', v_continued, 'suspended_access_count', v_suspended)
  );
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_lt_term(TEXT, DATE, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_lt_term(TEXT, DATE, DATE, BOOLEAN, TEXT) TO service_role;
