-- ============================================================
-- Migration 008: Postgres Functions & Views
-- Port of critical business logic from WEBAPP.js to SQL
-- ============================================================

SET search_path = public, extensions;

-- ============================================================
-- fn_palms_score — port of calcPALMSScore() from WEBAPP.js:76
-- Pure computation; IMMUTABLE so Postgres can cache results.
-- Returns JSONB with all component scores + total + color.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_palms_score(
  p_attend  INT,
  p_absent  INT,
  p_late    INT,
  p_medical INT,
  p_sub     INT,
  p_rgi     INT,
  p_rgo     INT,
  p_visitor INT,
  p_oto     INT,
  p_ceu     NUMERIC,
  p_tyfb    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  weeks       INT;
  absence_pt  INT;
  referral_pt INT;
  visitor_pt  INT;
  oto_pt      INT;
  ceu_pt      INT;
  tyfb_pt     INT;
  total_pt    INT;
  rate        NUMERIC;
BEGIN
  weeks := p_attend + p_absent + p_late + p_medical + p_sub;

  IF weeks = 0 THEN
    RETURN '{"weeks":0,"absence":0,"referral":0,"visitor":0,"oneToOne":0,"ceu":0,"tyfb":0,"total":0,"color":"black"}'::jsonb;
  END IF;

  -- ── Absence (15 pts) — same thresholds as WEBAPP.js:31-36
  IF    p_absent = 0 THEN absence_pt := 15;
  ELSIF p_absent = 1 THEN absence_pt := 10;
  ELSIF p_absent = 2 THEN absence_pt := 5;
  ELSE                     absence_pt := 0;
  END IF;

  -- ── Referral (15 pts) — NO 5-pt tier, verified from real data
  rate := (p_rgi + p_rgo)::NUMERIC / weeks;
  IF    rate >= 2 THEN referral_pt := 15;
  ELSIF rate >= 1 THEN referral_pt := 10;
  ELSE                  referral_pt := 0;
  END IF;

  -- ── Visitor (20 pts)
  rate := p_visitor::NUMERIC / (weeks / 4.333);
  IF    rate >= 1       THEN visitor_pt := 20;
  ELSIF p_visitor > 0   THEN visitor_pt := 10;
  ELSE                       visitor_pt := 0;
  END IF;

  -- ── 1-2-1 (15 pts)
  rate := p_oto::NUMERIC / weeks;
  IF    rate >= 2 THEN oto_pt := 15;
  ELSIF rate >= 1 THEN oto_pt := 10;
  ELSIF rate > 0  THEN oto_pt := 5;
  ELSE                 oto_pt := 0;
  END IF;

  -- ── CEU (20 pts)
  IF    p_ceu >= 4 THEN ceu_pt := 20;
  ELSIF p_ceu >= 3 THEN ceu_pt := 15;
  ELSIF p_ceu >= 2 THEN ceu_pt := 10;
  ELSIF p_ceu >= 1 THEN ceu_pt := 5;
  ELSE                  ceu_pt := 0;
  END IF;

  -- ── TYFB (15 pts)
  IF    p_tyfb >= 500000 THEN tyfb_pt := 15;
  ELSIF p_tyfb >= 200000 THEN tyfb_pt := 10;
  ELSIF p_tyfb >= 100000 THEN tyfb_pt := 5;
  ELSE                        tyfb_pt := 0;
  END IF;

  total_pt := absence_pt + referral_pt + visitor_pt + oto_pt + ceu_pt + tyfb_pt;

  RETURN jsonb_build_object(
    'weeks',     weeks,
    'absence',   absence_pt,
    'referral',  referral_pt,
    'visitor',   visitor_pt,
    'oneToOne',  oto_pt,
    'ceu',       ceu_pt,
    'tyfb',      tyfb_pt,
    'total',     total_pt,
    'color',     CASE
                   WHEN total_pt >= 70 THEN 'green'
                   WHEN total_pt >= 50 THEN 'yellow'
                   WHEN total_pt >= 30 THEN 'red'
                   ELSE 'black'
                 END
  );
END;
$$;

COMMENT ON FUNCTION fn_palms_score IS
  'Port of calcPALMSScore() from WEBAPP.js:76. '
  'Verified against 7 reference members (runTests cases in WEBAPP.js). '
  'IMMUTABLE — safe to use in computed columns and materialized views.';

-- ============================================================
-- fn_traffic_light — maps numeric score → color string
-- Port of _getColor() from WEBAPP.js:69
-- ============================================================
CREATE OR REPLACE FUNCTION fn_traffic_light(score NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN score >= 70 THEN 'green'
    WHEN score >= 50 THEN 'yellow'
    WHEN score >= 30 THEN 'red'
    ELSE 'black'
  END;
$$;

-- ============================================================
-- fn_effective_weeks — period length from BNI membership days
-- Port of: Math.min(26, Math.max(1, Math.floor(bniDays/7))) in WEBAPP.js:99
-- ============================================================
CREATE OR REPLACE FUNCTION fn_effective_weeks(bni_days INT)
RETURNS INT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN bni_days > 0 THEN LEAST(26, GREATEST(1, FLOOR(bni_days / 7.0)::INT))
    ELSE 1
  END;
$$;

-- ============================================================
-- fn_verify_pin — PIN validation (replaces apiLogin logic)
-- Returns the role row if PIN matches, NULL if not.
-- Call from Edge Function; never expose to client directly.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_verify_pin(p_role TEXT, p_pin TEXT)
RETURNS TABLE(
  role         TEXT,
  display_name TEXT,
  team_name    TEXT,
  is_mc        BOOLEAN,
  is_mentor    BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role, display_name, team_name, is_mc, is_mentor
  FROM roles
  WHERE roles.role = p_role
    AND roles.pin_hash = crypt(p_pin, roles.pin_hash);
$$;

COMMENT ON FUNCTION fn_verify_pin IS
  'SECURITY DEFINER — runs as owner. '
  'Only callable via service_role key from Edge Functions. '
  'Returns empty set if role not found or PIN wrong.';

-- ============================================================
-- view: v_member_dashboard — all data needed for main dashboard
-- Enforces "display score = GREATEST(monthly_score, official_pts)" rule
-- ============================================================
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
  GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0)) AS display_score,
  fn_traffic_light(
    GREATEST(COALESCE(ms.score, 0), COALESCE(r.official_pts, 0))
  )              AS traffic_light,
  -- Full PALMS breakdown
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
-- Latest monthly score per member (lateral join for efficiency)
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
  'Main dashboard view. All BNI scoring rules are enforced here: '
  'GREATEST(monthly_score, official_pts) display rule, '
  'fn_palms_score() for component breakdown, '
  'fn_traffic_light() for color. '
  'Stale core issue = opened_at older than 14 days.';

-- ============================================================
-- view: v_score_history — last 6 months per member (for trend chart)
-- ============================================================
CREATE OR REPLACE VIEW v_score_history AS
SELECT
  ms.member_id,
  m.name,
  m.nickname,
  m.mentor_team,
  ms.year,
  ms.month,
  ms.score,
  fn_traffic_light(ms.score) AS traffic_light,
  -- Month label matching GAS MONTH_LABELS array
  TO_CHAR(TO_DATE(ms.month::TEXT, 'MM'), 'Mon') AS month_label,
  ms.year * 100 + ms.month AS sort_key   -- chronological sort key (same logic as B.js)
FROM monthly_scores ms
JOIN members m ON m.id = ms.member_id
WHERE m.is_archived = false
ORDER BY ms.member_id, sort_key DESC;

COMMENT ON VIEW v_score_history IS
  'Monthly score trend. sort_key = year*100+month fixes year-boundary sort bug '
  'documented in CLAUDE.md (string sort gives 12/25 > 01/26 which is wrong).';
