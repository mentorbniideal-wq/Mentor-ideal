-- Migration 012 (2026-06-11): Complete member team moves
-- Moving a member should update the canonical members.mentor_team and keep
-- active/member-owned operational records aligned with the new team.

CREATE OR REPLACE FUNCTION fn_move_member_team(
  p_member_id   UUID,
  p_target_team TEXT,        -- NULL = remove from all teams
  p_moved_by    TEXT,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_from_team       TEXT;
  v_member_name     TEXT;
  v_to_role         TEXT;
  v_core_issues     INTEGER := 0;
  v_action_logs     INTEGER := 0;
  v_mentor_logs     INTEGER := 0;
  v_reviews         INTEGER := 0;
  v_assignments     INTEGER := 0;
  v_notifications   INTEGER := 0;
  v_growth_tasks    INTEGER := 0;
BEGIN
  SELECT mentor_team, name
  INTO v_from_team, v_member_name
  FROM members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  IF p_target_team IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM mentor_teams WHERE name = p_target_team) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid team: ' || p_target_team);
    END IF;
  END IF;

  IF v_from_team IS NOT DISTINCT FROM p_target_team THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', false,
      'message', 'Already in this team',
      'member', v_member_name,
      'from_team', v_from_team,
      'to_team', p_target_team
    );
  END IF;

  v_to_role := CASE lower(coalesce(p_target_team, ''))
    WHEN 'toomtam' THEN 'toomtam'
    WHEN 'aof'     THEN 'aof'
    WHEN 'draft'   THEN 'draft'
    WHEN 'phai'    THEN 'phai'
    WHEN 'amp'     THEN 'amp'
    ELSE NULL
  END;

  UPDATE members
  SET mentor_team = p_target_team,
      updated_at  = now()
  WHERE id = p_member_id;

  INSERT INTO member_team_history (member_id, from_team, to_team, moved_by_role, note)
  VALUES (p_member_id, v_from_team, p_target_team, coalesce(nullif(p_moved_by, ''), 'mc'), p_note);

  -- Active work should follow the member to the new mentor team.
  UPDATE core_issues
  SET mentor_team = p_target_team,
      updated_at  = now()
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL
    AND status = 'open';
  GET DIAGNOSTICS v_core_issues = ROW_COUNT;

  UPDATE mc_assignments
  SET mentor_team = p_target_team
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS v_assignments = ROW_COUNT;

  UPDATE team_notifs
  SET mentor_team = p_target_team
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL
    AND is_acked = false;
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  -- Logs/reviews are member-owned; keep their team label aligned for current
  -- mentor views. Historical audit of the move remains in member_team_history.
  UPDATE action_logs
  SET mentor_team = p_target_team
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL;
  GET DIAGNOSTICS v_action_logs = ROW_COUNT;

  UPDATE mentor_logs
  SET mentor_team = p_target_team
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL;
  GET DIAGNOSTICS v_mentor_logs = ROW_COUNT;

  UPDATE ninety_day_reviews
  SET mentor_team = p_target_team
  WHERE member_id = p_member_id
    AND p_target_team IS NOT NULL;
  GET DIAGNOSTICS v_reviews = ROW_COUNT;

  -- Growth tasks are assigned by role slug. Move only open tasks for this
  -- member so current work appears under the new mentor. Completed tasks remain
  -- as historical accountability.
  IF v_to_role IS NOT NULL THEN
    UPDATE growth_tasks
    SET assigned_to = v_to_role
    WHERE member_id = p_member_id
      AND responded_at IS NULL;
    GET DIAGNOSTICS v_growth_tasks = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'member', v_member_name,
    'from_team', v_from_team,
    'to_team', p_target_team,
    'moved', jsonb_build_object(
      'core_issues', v_core_issues,
      'mc_assignments', v_assignments,
      'team_notifs', v_notifications,
      'action_logs', v_action_logs,
      'mentor_logs', v_mentor_logs,
      'ninety_day_reviews', v_reviews,
      'growth_tasks', v_growth_tasks
    )
  );
END;
$$;

COMMENT ON FUNCTION fn_move_member_team(UUID, TEXT, TEXT, TEXT) IS
  'Moves a member between mentor teams, records member_team_history, and reassigns active/member-owned operational records to the new team.';
