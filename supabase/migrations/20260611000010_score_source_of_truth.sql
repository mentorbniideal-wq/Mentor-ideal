-- Migration 010 (2026-06-11): Make uploaded monthly_scores the score source of truth
-- Current displayed score must come from the latest imported score period only.
-- R2Y/Member Traffic Light raw stats remain available for PALMS and gap logic,
-- but official_pts must not override the uploaded current score.

CREATE OR REPLACE VIEW v_member_dashboard AS
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
  m.is_archived,
  m.given_thb,
  m.received_thb,
  -- Score source of truth: latest global monthly_scores period from Sync upload
  ms.score       AS latest_monthly_score,
  ms.year        AS score_year,
  ms.month       AS score_month,
  -- R2Y official score is retained for audit/gap logic only
  r.official_pts AS bni_official_pts,
  ms.score::NUMERIC AS display_score,
  fn_traffic_light(ms.score) AS traffic_light,
  -- Full PALMS breakdown (from raw R2Y/Member TL components)
  fn_palms_score(
    COALESCE(r.attend, 0), COALESCE(r.absent, 0),
    COALESCE(r.late, 0),   COALESCE(r.medical, 0), COALESCE(r.sub, 0),
    COALESCE(r.rg, 0),     0,
    COALESCE(r.visitors, 0), COALESCE(r.one_to_one, 0),
    COALESCE(r.ceu, 0),    COALESCE(r.tyfcb_thb, 0)
  )              AS palms_detail,
  -- Raw R2Y components for gap calculation in Edge Functions
  r.rg, r.rr, r.visitors, r.one_to_one, r.ceu, r.tyfcb_thb,
  r.attend, r.absent, r.late, r.medical, r.sub, r.bni_days,
  r.synced_at    AS r2y_synced_at,
  -- Renewal status
  ren.expiry_date,
  (ren.expiry_date - CURRENT_DATE) AS days_to_expiry,
  -- Open core issue
  ci.issue_text  AS open_core_issue,
  ci.opened_at   AS core_issue_opened_at
FROM members m
LEFT JOIN latest_period lp ON true
LEFT JOIN monthly_scores ms
  ON ms.member_id = m.id
 AND ms.year = lp.year
 AND ms.month = lp.month
LEFT JOIN r2y_stats   r   ON r.member_id   = m.id
LEFT JOIN renewals    ren ON ren.member_id  = m.id
LEFT JOIN core_issues ci  ON ci.member_id   = m.id AND ci.status = 'open'
WHERE m.is_archived = false;

COMMENT ON VIEW v_member_dashboard IS
  'Main dashboard view. display_score comes only from latest global monthly_scores period uploaded via Sync. '
  'R2Y official_pts is retained for PALMS/gap logic and does not override display score. '
  'Members missing the latest imported score period show traffic_light = none.';
