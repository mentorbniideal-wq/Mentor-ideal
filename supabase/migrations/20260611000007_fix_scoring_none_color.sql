-- Migration 007 (2026-06-11): Fix traffic_light for unscored members
-- Members with no imported score data should show 'none', not 'black'.
-- 'black' is a genuine low score (1-29). 'none' means "no data yet".

-- Update fn_traffic_light to accept NULL → return 'none'
CREATE OR REPLACE FUNCTION fn_traffic_light(score NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN score IS NULL OR score = 0 THEN 'none'
    WHEN score >= 70 THEN 'green'
    WHEN score >= 50 THEN 'yellow'
    WHEN score >= 30 THEN 'red'
    ELSE 'black'
  END;
$$;

-- Update v_member_dashboard to pass NULL when no data, so fn_traffic_light returns 'none'
CREATE OR REPLACE VIEW v_member_dashboard AS
SELECT
  m.id,
  m.name,
  m.nickname,
  m.mentor_team,
  m.is_archived,
  m.given_thb,
  m.received_thb,
  -- Latest monthly score (from Traffic Light CSV)
  ms.score       AS latest_monthly_score,
  ms.year        AS score_year,
  ms.month       AS score_month,
  -- R2Y official score
  r.official_pts AS bni_official_pts,
  -- Core display rule: use whichever is higher
  -- Returns NULL if no data on either side → traffic_light = 'none'
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
  -- Full PALMS breakdown (from raw R2Y components)
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
LEFT JOIN LATERAL (
  SELECT score, year, month
  FROM monthly_scores
  WHERE member_id = m.id
  ORDER BY year DESC, month DESC
  LIMIT 1
) ms ON true
LEFT JOIN r2y_stats   r   ON r.member_id   = m.id
LEFT JOIN renewals    ren ON ren.member_id  = m.id
LEFT JOIN core_issues ci  ON ci.member_id   = m.id AND ci.status = 'open'
WHERE m.is_archived = false;

COMMENT ON VIEW v_member_dashboard IS
  'Main dashboard view. display_score = GREATEST(monthly, official_pts). '
  'traffic_light = ''none'' when no data (new member), else green/yellow/red/black. '
  'fn_palms_score() for PALMS breakdown. fn_traffic_light() for color.';

-- Also add allowed_emails table for admin access management
CREATE TABLE IF NOT EXISTS allowed_emails (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  label      TEXT,
  added_by   TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE allowed_emails IS
  'Email whitelist for admin/backend access. Managed via admin panel by MC/TOOMTAM.';

-- RLS: only service_role can read/write (via Edge Function)
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
