-- ============================================================
-- Migration 011: Team Management
-- Allows all members (including LT/President/etc.) to be
-- assigned to a mentor team for organizational tracking.
-- MC can freely move any member between teams via the UI.
-- ============================================================

-- member_team_history — audit log of every team move
-- Lets MC see when/why a member was moved
CREATE TABLE IF NOT EXISTS member_team_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  from_team     TEXT        REFERENCES mentor_teams(name),
  to_team       TEXT        REFERENCES mentor_teams(name),
  moved_by_role TEXT        NOT NULL DEFAULT 'mc',
  note          TEXT,
  moved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_history_member ON member_team_history(member_id);
CREATE INDEX IF NOT EXISTS idx_team_history_moved_at ON member_team_history(moved_at DESC);

-- Enable RLS
ALTER TABLE member_team_history ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — accessible from Edge Functions only
-- No anon/client access to audit log

-- ── fn_move_member_team ───────────────────────────────────────
-- Atomically moves a member to a new team and records history.
-- Call from Edge Function with service_role only.
CREATE OR REPLACE FUNCTION fn_move_member_team(
  p_member_id   UUID,
  p_target_team TEXT,        -- NULL = remove from all teams
  p_moved_by    TEXT,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_team TEXT;
  v_member_name TEXT;
BEGIN
  -- Get current team
  SELECT mentor_team, name INTO v_from_team, v_member_name
  FROM members WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  -- Validate target team exists (if not null)
  IF p_target_team IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM mentor_teams WHERE name = p_target_team) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid team: ' || p_target_team);
    END IF;
  END IF;

  -- No-op if already in same team
  IF v_from_team IS NOT DISTINCT FROM p_target_team THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'message', 'Already in this team');
  END IF;

  -- Update member's team
  UPDATE members
  SET mentor_team = p_target_team,
      updated_at  = now()
  WHERE id = p_member_id;

  -- Record history
  INSERT INTO member_team_history (member_id, from_team, to_team, moved_by_role, note)
  VALUES (p_member_id, v_from_team, p_target_team, p_moved_by, p_note);

  RETURN jsonb_build_object(
    'ok',        true,
    'changed',   true,
    'member',    v_member_name,
    'from_team', v_from_team,
    'to_team',   p_target_team
  );
END;
$$;

-- ── v_members_by_team — view for team management UI ──────────
-- Shows ALL members (mentored + LT + President) grouped by team.
-- Members with no team appear in the unassigned list.
CREATE OR REPLACE VIEW v_members_by_team AS
SELECT
  m.id,
  m.name,
  m.nickname,
  m.mentor_team,
  m.is_mentored,
  m.is_archived,
  m.given_thb,
  m.received_thb,
  m.mentor_status,
  -- Latest score from monthly_scores
  COALESCE(ms.score, 0)                         AS latest_score,
  -- Traffic light
  CASE
    WHEN COALESCE(ms.score, 0) >= 70 THEN 'green'
    WHEN COALESCE(ms.score, 0) >= 50 THEN 'yellow'
    WHEN COALESCE(ms.score, 0) >= 30 THEN 'red'
    ELSE 'black'
  END                                            AS traffic_light,
  ms.year                                        AS score_year,
  ms.month                                       AS score_month
FROM members m
LEFT JOIN LATERAL (
  SELECT score, year, month
  FROM monthly_scores
  WHERE member_id = m.id
  ORDER BY (year * 100 + month) DESC
  LIMIT 1
) ms ON true
WHERE m.is_archived = false
ORDER BY
  m.mentor_team NULLS LAST,
  m.is_mentored DESC,
  m.name;
