-- Member Success Blueprint (MSB) MVP v1.0
-- Stores only new annual business planning data.
-- Member identity/profile/team/performance data remains owned by existing members,
-- monthly_scores, r2y_stats, PALMS, Traffic Light, LINE, and Passport tables.

CREATE TABLE IF NOT EXISTS public.member_success_blueprints (
  id                                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                            UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  blueprint_year                       INT NOT NULL CHECK (blueprint_year >= 2020 AND blueprint_year <= 2100),
  total_sales_target_year              NUMERIC NOT NULL,
  expected_sales_from_bni_year         NUMERIC NOT NULL,
  existing_customer_revenue_from_bni   NUMERIC,
  new_customer_revenue_from_bni        NUMERIC,
  average_customer_value_year          NUMERIC NOT NULL,
  conversion_rate_percent              NUMERIC NOT NULL,
  bni_contribution_percent             NUMERIC,
  customer_needed                      NUMERIC,
  referral_needed                      NUMERIC,
  referral_per_month                   NUMERIC,
  referral_per_week                    NUMERIC,
  calculated_at                        TIMESTAMPTZ,
  looking_for_categories               TEXT[] NOT NULL DEFAULT '{}',
  looking_for_detail                   TEXT NOT NULL,
  power_team_categories                TEXT[] NOT NULL DEFAULT '{}',
  power_team_detail                    TEXT NOT NULL,
  personal_goal_category               TEXT NOT NULL,
  personal_goal_detail                 TEXT,
  status                               TEXT NOT NULL DEFAULT 'draft'
                                       CHECK (status IN ('draft', 'submitted')),
  source                               TEXT NOT NULL DEFAULT 'member_form',
  created_at                           TIMESTAMPTZ DEFAULT now(),
  updated_at                           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, blueprint_year)
);

CREATE INDEX IF NOT EXISTS idx_member_success_blueprints_member_id
  ON public.member_success_blueprints(member_id);

CREATE INDEX IF NOT EXISTS idx_member_success_blueprints_year
  ON public.member_success_blueprints(blueprint_year);

CREATE INDEX IF NOT EXISTS idx_member_success_blueprints_status
  ON public.member_success_blueprints(status);

ALTER TABLE public.member_success_blueprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_success_blueprints FROM anon, authenticated;

COMMENT ON TABLE public.member_success_blueprints IS
  'Member Success Blueprint annual planning data. Does not duplicate member profile, team, Traffic Light, PALMS, R2Y, or LINE goal data.';
