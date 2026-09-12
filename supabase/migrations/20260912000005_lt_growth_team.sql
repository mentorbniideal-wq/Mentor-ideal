-- Growth LT: one lead and up to two co-leads per active LT term.
-- Additive; existing Growth Coordinator assignments remain a routing fallback.
CREATE TABLE IF NOT EXISTS public.lt_growth_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES public.lt_terms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  position TEXT NOT NULL CHECK (position IN ('lead', 'co_lead')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(term_id, member_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lt_growth_team_one_lead
  ON public.lt_growth_team_members(term_id) WHERE position = 'lead';

-- PostgreSQL cannot express "at most two" with a simple unique constraint.
CREATE OR REPLACE FUNCTION public.fn_enforce_lt_growth_team_size()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.position = 'co_lead' AND (
    SELECT count(*) FROM public.lt_growth_team_members
    WHERE term_id = NEW.term_id AND position = 'co_lead' AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) >= 2 THEN RAISE EXCEPTION 'Growth Co-Lead ได้สูงสุด 2 คนต่อวาระ'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_lt_growth_team_size BEFORE INSERT OR UPDATE ON public.lt_growth_team_members
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_lt_growth_team_size();
ALTER TABLE public.lt_growth_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lt_growth_team_members FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_lt_growth_team_term ON public.lt_growth_team_members(term_id, position);
COMMENT ON TABLE public.lt_growth_team_members IS 'Growth LT roster. Lead receives escalations; up to two Co-Leads can receive Growth requests.';
