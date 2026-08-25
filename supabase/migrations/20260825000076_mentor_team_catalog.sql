-- Major Upgrade Phase 1: stable Mentor Team identity with term-aware display.
-- The existing mentor_teams.name remains the durable code used by members and
-- historical records. Display names can change safely when leadership changes.

ALTER TABLE public.mentor_teams
  ADD COLUMN IF NOT EXISTS leader_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS active_term_id UUID REFERENCES public.lt_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.mentor_teams
SET display_name = COALESCE(NULLIF(display_name, ''), 'ทีม ' || leader_name),
    updated_at = now()
WHERE display_name IS NULL OR btrim(display_name) = '';

COMMENT ON COLUMN public.mentor_teams.name IS
  'Stable internal team code. Never rename this value when a Mentor leader changes.';
COMMENT ON COLUMN public.mentor_teams.display_name IS
  'Term-aware label shown in Desktop, Mentor Mobile and LIFF.';

CREATE INDEX IF NOT EXISTS idx_mentor_teams_leader_member
  ON public.mentor_teams(leader_member_id);
