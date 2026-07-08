-- MSB Intelligence Layer MVP v1.0
-- Read-only views that combine MSB PLAN with existing ACTUAL sources.
-- Do not mutate or redefine Traffic Light, PALMS, R2Y, Growth Revenue, line_goals, or members.bni_goal logic.

CREATE OR REPLACE VIEW public.v_msb_member_intelligence_base AS
WITH blueprint_years AS (
  SELECT generate_series(
    EXTRACT(YEAR FROM now())::INT - 1,
    EXTRACT(YEAR FROM now())::INT + 2
  )::INT AS blueprint_year
  UNION
  SELECT DISTINCT blueprint_year
  FROM public.member_success_blueprints
),
growth_actuals AS (
  SELECT
    member_id,
    SUM(COALESCE(received_thb, 0)) AS growth_received_thb,
    SUM(COALESCE(target_thb, 0)) AS growth_target_thb
  FROM public.growth_referral_members
  WHERE member_id IS NOT NULL
  GROUP BY member_id
)
SELECT
  m.id AS member_id,
  m.name,
  m.nickname,
  m.profession,
  m.company_name,
  m.mentor_team,
  y.blueprint_year,

  msb.id AS blueprint_id,
  msb.status AS blueprint_status,
  msb.total_sales_target_year,
  msb.expected_sales_from_bni_year,
  msb.existing_customer_revenue_from_bni,
  msb.new_customer_revenue_from_bni,
  msb.average_customer_value_year,
  msb.conversion_rate_percent,
  msb.bni_contribution_percent,
  msb.customer_needed,
  msb.referral_needed,
  msb.referral_per_month,
  msb.referral_per_week,
  msb.looking_for_categories,
  msb.looking_for_detail,
  msb.power_team_categories,
  msb.power_team_detail,
  msb.personal_goal_category,
  msb.personal_goal_detail,
  msb.calculated_at,
  msb.created_at AS blueprint_created_at,
  msb.updated_at AS blueprint_updated_at,

  vd.traffic_light,
  vd.latest_monthly_score,
  vd.display_score,
  vd.rg,
  vd.rr,
  vd.visitors,
  vd.one_to_one,
  vd.ceu,
  vd.tyfcb_thb,
  vd.bni_days,
  m.given_thb,
  m.received_thb,
  ga.growth_received_thb,
  ga.growth_target_thb,
  vd.r2y_synced_at
FROM public.members m
CROSS JOIN blueprint_years y
LEFT JOIN public.member_success_blueprints msb
  ON msb.member_id = m.id
 AND msb.blueprint_year = y.blueprint_year
LEFT JOIN public.v_member_dashboard vd
  ON vd.id = m.id
LEFT JOIN growth_actuals ga
  ON ga.member_id = m.id
WHERE COALESCE(m.is_archived, false) = false;

COMMENT ON VIEW public.v_msb_member_intelligence_base IS
  'Read-only MSB intelligence base. MSB fields are PLAN; dashboard/R2Y/member/growth fields are ACTUAL and labelled by source.';

CREATE OR REPLACE VIEW public.v_msb_plan_vs_actual AS
SELECT
  b.*,
  b.received_thb AS actual_received_thb,
  CASE
    WHEN b.expected_sales_from_bni_year IS NULL OR b.expected_sales_from_bni_year <= 0 THEN NULL
    ELSE ROUND((COALESCE(b.received_thb, 0) / NULLIF(b.expected_sales_from_bni_year, 0)) * 100, 1)
  END AS revenue_progress_percent,
  CASE
    WHEN b.expected_sales_from_bni_year IS NULL THEN NULL
    ELSE GREATEST(0, b.expected_sales_from_bni_year - COALESCE(b.received_thb, 0))
  END AS revenue_gap,
  CASE
    WHEN b.referral_needed IS NULL OR b.referral_needed <= 0 THEN NULL
    ELSE ROUND((COALESCE(b.rr, 0)::NUMERIC / NULLIF(b.referral_needed, 0)) * 100, 1)
  END AS referral_progress_percent,
  CASE
    WHEN b.referral_needed IS NULL THEN NULL
    ELSE GREATEST(0, b.referral_needed - COALESCE(b.rr, 0))
  END AS referral_gap,
  CASE
    WHEN COALESCE(b.bni_days, 0) <= 0 THEN NULL
    ELSE ROUND((COALESCE(b.rr, 0)::NUMERIC / GREATEST(1, (b.bni_days::NUMERIC / 7))), 2)
  END AS estimated_actual_referral_per_week,
  CASE
    WHEN b.referral_per_week IS NULL THEN NULL
    WHEN COALESCE(b.bni_days, 0) <= 0 THEN b.referral_per_week
    ELSE ROUND(b.referral_per_week - (COALESCE(b.rr, 0)::NUMERIC / GREATEST(1, (b.bni_days::NUMERIC / 7))), 2)
  END AS referral_week_gap,
  CASE
    WHEN b.blueprint_id IS NULL THEN 'no_plan'
    WHEN b.expected_sales_from_bni_year IS NULL AND b.referral_needed IS NULL THEN 'no_plan'
    WHEN b.received_thb IS NULL AND b.rr IS NULL THEN 'no_actual_data'
    WHEN GREATEST(
      COALESCE((COALESCE(b.received_thb, 0) / NULLIF(b.expected_sales_from_bni_year, 0)) * 100, 0),
      COALESCE((COALESCE(b.rr, 0)::NUMERIC / NULLIF(b.referral_needed, 0)) * 100, 0)
    ) >= 70 THEN 'on_track'
    WHEN GREATEST(
      COALESCE((COALESCE(b.received_thb, 0) / NULLIF(b.expected_sales_from_bni_year, 0)) * 100, 0),
      COALESCE((COALESCE(b.rr, 0)::NUMERIC / NULLIF(b.referral_needed, 0)) * 100, 0)
    ) >= 40 THEN 'behind'
    ELSE 'critical'
  END AS intelligence_status
FROM public.v_msb_member_intelligence_base b;

COMMENT ON VIEW public.v_msb_plan_vs_actual IS
  'Read-only MSB plan-vs-actual calculations. Actual Received = members.received_thb; PALMS TYFCB remains r2y_stats.tyfcb_thb.';

CREATE OR REPLACE VIEW public.v_msb_category_demand AS
SELECT
  b.member_id,
  b.blueprint_year,
  b.mentor_team,
  'looking_for'::TEXT AS category_type,
  category,
  b.looking_for_detail AS detail
FROM public.v_msb_member_intelligence_base b
CROSS JOIN LATERAL unnest(COALESCE(b.looking_for_categories, '{}'::TEXT[])) AS c(category)
WHERE b.blueprint_id IS NOT NULL
UNION ALL
SELECT
  b.member_id,
  b.blueprint_year,
  b.mentor_team,
  'power_team'::TEXT AS category_type,
  category,
  b.power_team_detail AS detail
FROM public.v_msb_member_intelligence_base b
CROSS JOIN LATERAL unnest(COALESCE(b.power_team_categories, '{}'::TEXT[])) AS c(category)
WHERE b.blueprint_id IS NOT NULL;

COMMENT ON VIEW public.v_msb_category_demand IS
  'Exploded MSB category demand for Growth/LT summaries. Category suggestions are planning intent, not confirmed referral relationships.';
