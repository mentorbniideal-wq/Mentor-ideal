-- MSB / Growth Plan data quality support
-- Adds lightweight governance tables without changing source-of-truth values.

CREATE TABLE IF NOT EXISTS public.msb_category_aliases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_type      TEXT NOT NULL CHECK (category_type IN ('looking_for', 'power_team')),
  canonical_category TEXT NOT NULL,
  alias              TEXT NOT NULL,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_type, alias)
);

CREATE INDEX IF NOT EXISTS idx_msb_category_aliases_type
  ON public.msb_category_aliases(category_type, canonical_category);

ALTER TABLE public.msb_category_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.msb_category_aliases FROM anon, authenticated;

COMMENT ON TABLE public.msb_category_aliases IS
  'Optional category library for normalizing MSB Looking For / Power Team wording. Does not mutate submitted blueprints.';

CREATE TABLE IF NOT EXISTS public.msb_goal_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  blueprint_year  INT NOT NULL CHECK (blueprint_year >= 2020 AND blueprint_year <= 2100),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'needs_revision')),
  note            TEXT,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, blueprint_year)
);

CREATE INDEX IF NOT EXISTS idx_msb_goal_reviews_status
  ON public.msb_goal_reviews(blueprint_year, status);

ALTER TABLE public.msb_goal_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.msb_goal_reviews FROM anon, authenticated;

COMMENT ON TABLE public.msb_goal_reviews IS
  'MC/Growth review workflow for cases where MSB Goal differs materially from legacy Growth target. Does not overwrite either target.';
