-- Migration 011 (2026-06-11): Align team management scores with Sync source of truth
-- v_members_by_team is used by member/team management endpoints, so it must
-- follow the same latest global monthly_scores period as v_member_dashboard.

CREATE OR REPLACE VIEW v_members_by_team AS
WITH latest_period AS (
  SELECT year, month
  FROM monthly_scores
  ORDER BY year DESC, month DESC
  LIMIT 1
)
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
  ms.score::NUMERIC AS latest_score,
  fn_traffic_light(ms.score) AS traffic_light,
  ms.year AS score_year,
  ms.month AS score_month
FROM members m
LEFT JOIN latest_period lp ON true
LEFT JOIN monthly_scores ms
  ON ms.member_id = m.id
 AND ms.year = lp.year
 AND ms.month = lp.month
WHERE m.is_archived = false
ORDER BY
  m.mentor_team NULLS LAST,
  m.is_mentored DESC,
  m.name;

COMMENT ON VIEW v_members_by_team IS
  'Team management view. latest_score comes only from latest global monthly_scores period uploaded via Sync.';
