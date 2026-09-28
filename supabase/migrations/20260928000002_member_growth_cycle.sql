-- Growth's shared operational memory. Members, renewal dates, Blueprint,
-- Tasks, MY121 and Membership Committee signals remain their source systems.
CREATE TABLE public.member_growth_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, expiry_date)
);
CREATE INDEX idx_member_growth_cycles_chapter_expiry ON public.member_growth_cycles(chapter_id, expiry_date);

CREATE TABLE public.member_growth_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.member_growth_cycles(id) ON DELETE RESTRICT,
  month_number SMALLINT NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_member','completed')),
  result TEXT NOT NULL DEFAULT '' CHECK (char_length(result) <= 1000),
  issue TEXT NOT NULL DEFAULT '' CHECK (char_length(issue) <= 1000),
  next_action TEXT NOT NULL DEFAULT '' CHECK (char_length(next_action) <= 1000),
  follow_up_date DATE,
  related_growth_task_id UUID REFERENCES public.growth_tasks(id) ON DELETE SET NULL,
  related_proposal_id UUID REFERENCES public.power_team_proposals(id) ON DELETE SET NULL,
  related_my121_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL,
  handoff_signal_id UUID REFERENCES public.member_signals(id) ON DELETE SET NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, month_number)
);
CREATE INDEX idx_member_growth_entries_due ON public.member_growth_entries(follow_up_date, status);

CREATE TABLE public.member_growth_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.member_growth_entries(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  request_key TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_growth_notes_entry_created ON public.member_growth_notes(entry_id, created_at DESC);

CREATE FUNCTION public.guard_member_growth_record() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE scoped_chapter UUID; scoped_member UUID;
BEGIN
  IF TG_TABLE_NAME = 'member_growth_cycles' THEN
    SELECT chapter_id INTO scoped_chapter FROM public.members WHERE id = NEW.member_id;
    IF scoped_chapter IS DISTINCT FROM NEW.chapter_id THEN RAISE EXCEPTION 'Growth cycle Chapter mismatch'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.chapter_id IS DISTINCT FROM OLD.chapter_id OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date) THEN
      RAISE EXCEPTION 'Growth cycle identity is immutable';
    END IF;
  ELSE
    SELECT chapter_id, member_id INTO scoped_chapter, scoped_member FROM public.member_growth_cycles WHERE id = NEW.cycle_id;
    IF TG_OP = 'UPDATE' AND (NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.month_number IS DISTINCT FROM OLD.month_number) THEN
      RAISE EXCEPTION 'Growth entry identity is immutable';
    END IF;
    IF NEW.related_growth_task_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.growth_tasks WHERE id = NEW.related_growth_task_id AND chapter_id = scoped_chapter AND member_id = scoped_member) THEN
      RAISE EXCEPTION 'Growth Task must belong to the same member and Chapter';
    END IF;
    IF NEW.related_proposal_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.power_team_proposals p JOIN public.power_team_proposal_members pm ON pm.proposal_id = p.id
       WHERE p.id = NEW.related_proposal_id AND p.chapter_id = scoped_chapter AND pm.member_id = scoped_member) THEN
      RAISE EXCEPTION 'Proposal must include the same member and Chapter';
    END IF;
    IF NEW.related_my121_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.matching_pairs pair JOIN public.matching_rounds round ON round.id = pair.round_id
       WHERE pair.id = NEW.related_my121_id AND round.chapter_id = scoped_chapter
         AND scoped_member IN (pair.member_a_id, pair.member_b_id, pair.optional_member_c_id)
         AND pair.status IN ('verified','late_verified')) THEN
      RAISE EXCEPTION 'MY121 link requires a verified pair for this member and Chapter';
    END IF;
    IF NEW.handoff_signal_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.member_signals WHERE id = NEW.handoff_signal_id AND member_id = scoped_member) THEN
      RAISE EXCEPTION 'Handoff must belong to the same member';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_growth_cycles BEFORE INSERT OR UPDATE ON public.member_growth_cycles FOR EACH ROW EXECUTE FUNCTION public.guard_member_growth_record();
CREATE TRIGGER guard_member_growth_entries BEFORE INSERT OR UPDATE ON public.member_growth_entries FOR EACH ROW EXECUTE FUNCTION public.guard_member_growth_record();

CREATE FUNCTION public.guard_member_growth_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Growth notes are append-only'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_growth_notes BEFORE UPDATE OR DELETE ON public.member_growth_notes FOR EACH ROW EXECUTE FUNCTION public.guard_member_growth_note();

CREATE FUNCTION public.audit_member_growth_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE scoped_chapter UUID; prior_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'member_growth_entries' THEN prior_status := OLD.status; END IF;
  SELECT chapter_id INTO scoped_chapter FROM public.member_growth_cycles c
    JOIN public.member_growth_entries e ON e.cycle_id = c.id
    WHERE e.id = CASE WHEN TG_TABLE_NAME = 'member_growth_notes' THEN NEW.entry_id ELSE NEW.id END;
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES (scoped_chapter,
    CASE WHEN TG_TABLE_NAME = 'member_growth_notes' THEN 'member_growth_note_added' ELSE 'member_growth_entry_saved' END,
    'growth', CASE WHEN TG_TABLE_NAME = 'member_growth_notes' THEN NEW.created_by ELSE NEW.updated_by END,
    TG_TABLE_NAME, NEW.id::text,
    CASE WHEN TG_TABLE_NAME = 'member_growth_notes' THEN jsonb_build_object('entry_id',NEW.entry_id)
      ELSE jsonb_build_object('month',NEW.month_number,'from_status',prior_status,
        'to_status',NEW.status,'follow_up_date',NEW.follow_up_date) END);
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_member_growth_entries AFTER INSERT OR UPDATE ON public.member_growth_entries FOR EACH ROW EXECUTE FUNCTION public.audit_member_growth_change();
CREATE TRIGGER audit_member_growth_notes AFTER INSERT ON public.member_growth_notes FOR EACH ROW EXECUTE FUNCTION public.audit_member_growth_change();

ALTER TABLE public.member_growth_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_growth_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_growth_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_growth_cycles, public.member_growth_entries, public.member_growth_notes FROM anon, authenticated;
