-- Migration 039: Add membership_start_date and joined_date to v_members_by_team
-- Needed by the Edit Member UI to pre-fill the form.

CREATE OR REPLACE VIEW v_members_by_team AS
WITH latest_period AS (
  SELECT year, month
  FROM monthly_scores
  GROUP BY year, month
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
  ms.month AS score_month,
  m.membership_start_date,
  m.joined_date
FROM members m
LEFT JOIN latest_period lp ON true
LEFT JOIN monthly_scores ms
  ON ms.member_id = m.id
 AND ms.year = lp.year
 AND ms.month = lp.month
WHERE m.is_archived = false;
