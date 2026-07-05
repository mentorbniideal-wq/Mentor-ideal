-- Migration 048: Add bni_goal to members table and expose in v_member_dashboard
-- bni_goal: member's self-set BNI revenue target (฿), tracked in Power Teams manager

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS bni_goal NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Rebuild view — append bni_goal at end to preserve existing column positions
CREATE OR REPLACE VIEW v_member_dashboard AS
SELECT
  m.id,
  m.name,
  m.nickname,
  m.mentor_team,
  m.is_archived,
  m.given_thb,
  m.received_thb,
  ms.score       AS latest_monthly_score,
  ms.year        AS score_year,
  ms.month       AS score_month,
  r.official_pts AS bni_official_pts,
  CASE
    WHEN ms.score IS NULL AND (r.official_pts IS NULL OR r.official_pts = 0) THEN NULL
    ELSE GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0))
  END              AS display_score,
  CASE
    WHEN ms.score IS NULL AND (r.official_pts IS NULL OR r.official_pts = 0) THEN 'none'
    ELSE fn_traffic_light(
      GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0))
    )
  END              AS traffic_light,
  fn_palms_score(
    COALESCE(r.attend, 0), COALESCE(r.absent, 0),
    COALESCE(r.late, 0),   COALESCE(r.medical, 0), COALESCE(r.sub, 0),
    COALESCE(r.rg, 0),     0,
    COALESCE(r.visitors, 0), COALESCE(r.one_to_one, 0),
    COALESCE(r.ceu, 0),    COALESCE(r.tyfcb_thb, 0)
  )              AS palms_detail,
  r.rg, r.rr, r.visitors, r.one_to_one, r.ceu, r.tyfcb_thb,
  r.attend, r.absent, r.late, r.medical, r.sub,
  COALESCE(
    NULLIF(r.bni_days, 0),
    CASE WHEN m.membership_start_date IS NOT NULL
         THEN GREATEST(1, (CURRENT_DATE - m.membership_start_date)::INT)
         ELSE NULL END
  ) AS bni_days,
  r.synced_at    AS r2y_synced_at,
  ren.expiry_date,
  (ren.expiry_date - CURRENT_DATE) AS days_to_expiry,
  ci.issue_text  AS open_core_issue,
  ci.opened_at   AS core_issue_opened_at,
  m.mentoring_mode,
  m.membership_start_date,
  m.joined_date,
  -- appended last
  m.bni_goal
FROM members m
LEFT JOIN LATERAL (
  SELECT score, year, month
  FROM monthly_scores
  WHERE member_id = m.id
    AND (year * 100 + month) <= (EXTRACT(YEAR FROM NOW())::INT * 100 + EXTRACT(MONTH FROM NOW())::INT)
  ORDER BY year DESC, month DESC
  LIMIT 1
) ms ON true
LEFT JOIN r2y_stats   r   ON r.member_id   = m.id
LEFT JOIN renewals    ren ON ren.member_id  = m.id
LEFT JOIN core_issues ci  ON ci.member_id   = m.id AND ci.status = 'open'
WHERE m.is_archived = false;
