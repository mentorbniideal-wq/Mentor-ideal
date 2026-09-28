-- An official Growth Power Team is an Admin-approved publication of an
-- existing Proposal. Legacy power_teams pair history remains untouched.
CREATE TABLE IF NOT EXISTS public.growth_power_team_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  proposal_id UUID NOT NULL UNIQUE REFERENCES public.power_team_proposals(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  published_by_email TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by_email TEXT,
  archived_at TIMESTAMPTZ,
  CHECK ((status = 'active' AND archived_at IS NULL AND archived_by_email IS NULL)
      OR (status = 'archived' AND archived_at IS NOT NULL AND archived_by_email IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_growth_power_team_publications_chapter_status
  ON public.growth_power_team_publications(chapter_id, status, published_at DESC);

CREATE OR REPLACE FUNCTION public.fn_guard_growth_power_team_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE proposal_chapter UUID; proposal_status TEXT; member_count INTEGER; scoped_member_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Power Team publication history cannot be deleted'; END IF;
  SELECT chapter_id, status INTO proposal_chapter, proposal_status FROM public.power_team_proposals WHERE id = NEW.proposal_id FOR UPDATE;
  IF proposal_chapter IS DISTINCT FROM NEW.chapter_id THEN
    RAISE EXCEPTION 'Power Team publication must use its Proposal Chapter';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO member_count FROM public.power_team_proposal_members WHERE proposal_id = NEW.proposal_id;
    SELECT count(*) INTO scoped_member_count FROM public.power_team_proposal_members pm
      JOIN public.members m ON m.id = pm.member_id
      WHERE pm.proposal_id = NEW.proposal_id AND m.chapter_id = NEW.chapter_id AND m.is_archived = false;
    IF proposal_status <> 'active' OR member_count < 2 OR scoped_member_count <> member_count THEN
      RAISE EXCEPTION 'Only an active Proposal with two or more active members in the same Chapter may be published';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.chapter_id IS DISTINCT FROM OLD.chapter_id OR
       NEW.proposal_id IS DISTINCT FROM OLD.proposal_id OR
       NEW.published_by_email IS DISTINCT FROM OLD.published_by_email OR
       NEW.published_at IS DISTINCT FROM OLD.published_at OR
       OLD.status = 'archived' OR
       (OLD.status = 'active' AND NEW.status <> 'archived') THEN
      RAISE EXCEPTION 'Power Team publication history is immutable';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_growth_power_team_publication
  BEFORE INSERT OR UPDATE OR DELETE ON public.growth_power_team_publications
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_growth_power_team_publication();

CREATE OR REPLACE FUNCTION public.fn_audit_growth_power_team_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.chapter_audit_events
    (chapter_id, event_type, actor_role, actor_ref, subject_type, subject_ref, metadata)
  VALUES
    (NEW.chapter_id,
     CASE WHEN TG_OP = 'INSERT' THEN 'growth_power_team_published' ELSE 'growth_power_team_archived' END,
     'admin', CASE WHEN TG_OP = 'INSERT' THEN NEW.published_by_email ELSE NEW.archived_by_email END,
     'growth_power_team', NEW.id::TEXT,
     jsonb_build_object('proposal_id', NEW.proposal_id));
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_audit_growth_power_team_publication
  AFTER INSERT OR UPDATE OF status ON public.growth_power_team_publications
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_growth_power_team_publication();

CREATE OR REPLACE FUNCTION public.fn_guard_published_power_team_proposal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.growth_power_team_publications WHERE proposal_id = OLD.id) THEN
    RAISE EXCEPTION 'Published Power Team Proposal is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_published_power_team_proposal
  BEFORE UPDATE OR DELETE ON public.power_team_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_published_power_team_proposal();

CREATE OR REPLACE FUNCTION public.fn_guard_published_power_team_members()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE source_proposal UUID;
BEGIN
  source_proposal := CASE WHEN TG_OP = 'INSERT' THEN NEW.proposal_id ELSE OLD.proposal_id END;
  IF EXISTS (SELECT 1 FROM public.growth_power_team_publications WHERE proposal_id = source_proposal) THEN
    RAISE EXCEPTION 'Published Power Team membership is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.growth_power_team_publications WHERE proposal_id = NEW.proposal_id) THEN
    RAISE EXCEPTION 'Published Power Team membership is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_published_power_team_members
  BEFORE INSERT OR UPDATE OR DELETE ON public.power_team_proposal_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_published_power_team_members();

ALTER TABLE public.growth_power_team_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_power_team_publications FROM anon, authenticated;
COMMENT ON TABLE public.growth_power_team_publications IS
  'Admin-approved Growth Power Teams linked to immutable Proposal membership; not legacy pairings or Mentor teams.';
