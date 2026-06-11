-- Fix v_members_by_team to use GREATEST(monthly_score, official_pts)
-- Per score display rule: always show max of both sources

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
  -- Display score: enforce GREATEST rule
  GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0)) AS latest_score,
  -- Traffic light from combined score
  fn_traffic_light(
    GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0))
  )                                                             AS traffic_light,
  ms.year                                                       AS score_year,
  ms.month                                                      AS score_month
FROM members m
LEFT JOIN LATERAL (
  SELECT score, year, month
  FROM monthly_scores
  WHERE member_id = m.id
  ORDER BY (year * 100 + month) DESC
  LIMIT 1
) ms ON true
LEFT JOIN r2y_stats r ON r.member_id = m.id
WHERE m.is_archived = false
ORDER BY
  m.mentor_team NULLS LAST,
  m.is_mentored DESC,
  m.name;
