-- Atomic bulk team movement for the Mentor Team manager.
-- Reuses members.mentor_team and member_team_history as the source of truth.

CREATE OR REPLACE FUNCTION public.fn_bulk_move_members_team(
  p_member_ids UUID[],
  p_target_team TEXT,
  p_moved_by TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested INTEGER;
  v_found INTEGER;
  v_changed INTEGER;
BEGIN
  SELECT count(DISTINCT id) INTO v_requested FROM unnest(p_member_ids) AS id;
  IF v_requested < 1 OR v_requested > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 members';
  END IF;
  IF p_target_team IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mentor_teams WHERE name = p_target_team
  ) THEN
    RAISE EXCEPTION 'Invalid team: %', p_target_team;
  END IF;

  -- Lock the selected rows before writing history so simultaneous moves cannot
  -- record a stale from_team. Aggregate queries cannot carry FOR UPDATE.
  PERFORM id
  FROM members
  WHERE id = ANY(p_member_ids) AND is_archived = false
  FOR UPDATE;

  SELECT count(*) INTO v_found
  FROM members
  WHERE id = ANY(p_member_ids) AND is_archived = false;
  IF v_found <> v_requested THEN
    RAISE EXCEPTION 'One or more members were not found or are archived';
  END IF;

  INSERT INTO member_team_history(member_id, from_team, to_team, moved_by_role, note)
  SELECT id, mentor_team, p_target_team, COALESCE(NULLIF(btrim(p_moved_by), ''), 'mc'),
         left(NULLIF(btrim(p_note), ''), 500)
  FROM members
  WHERE id = ANY(p_member_ids)
    AND mentor_team IS DISTINCT FROM p_target_team;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  UPDATE members
  SET mentor_team = p_target_team, updated_at = now()
  WHERE id = ANY(p_member_ids)
    AND mentor_team IS DISTINCT FROM p_target_team;

  RETURN jsonb_build_object(
    'ok', true,
    'requested_count', v_requested,
    'moved_count', v_changed,
    'unchanged_count', v_requested - v_changed,
    'to_team', p_target_team
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bulk_move_members_team(UUID[], TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bulk_move_members_team(UUID[], TEXT, TEXT, TEXT)
  TO service_role;
