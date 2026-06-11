-- Historical note: this migration used to delete monthly scores beyond the
-- server calendar month. That is no longer valid because Traffic Light
-- Evolution uploads can define the current score period independently from
-- the server date. Keep all uploaded monthly_scores rows intact.

-- Rebuild v_member_dashboard with same column order as migration 007
-- but cap monthly_scores at current month via LATERAL WHERE clause
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
  fn_traffic_light(
    CASE
      WHEN ms.score IS NULL AND (r.official_pts IS NULL OR r.official_pts = 0) THEN NULL
      ELSE GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0))
    END
  )              AS traffic_light,
  fn_palms_score(
    COALESCE(r.attend, 0), COALESCE(r.absent, 0),
    COALESCE(r.late, 0),   COALESCE(r.medical, 0), COALESCE(r.sub, 0),
    COALESCE(r.rg, 0),     0,
    COALESCE(r.visitors, 0), COALESCE(r.one_to_one, 0),
    COALESCE(r.ceu, 0),    COALESCE(r.tyfcb_thb, 0)
  )              AS palms_detail,
  r.rg, r.rr, r.visitors, r.one_to_one, r.ceu, r.tyfcb_thb,
  r.attend, r.absent, r.late, r.medical, r.sub, r.bni_days,
  r.synced_at    AS r2y_synced_at,
  ren.expiry_date,
  (ren.expiry_date - CURRENT_DATE) AS days_to_expiry,
  ci.issue_text  AS open_core_issue,
  ci.opened_at   AS core_issue_opened_at
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

COMMENT ON VIEW v_member_dashboard IS
  'display_score = GREATEST(monthly_capped_at_today, official_pts). '
  'monthly_scores capped at current month to exclude future pre-fills.';
