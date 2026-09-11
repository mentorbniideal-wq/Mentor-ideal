-- Draft Power Team proposals are distinct from mentor teams and official
-- Power Team pairings. They are scoped to the active Chapter and only become
-- a shared working proposal after a Growth/MC user explicitly saves one.
CREATE TABLE IF NOT EXISTS public.power_team_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  target_customer_group TEXT NOT NULL CHECK (char_length(btrim(target_customer_group)) BETWEEN 2 AND 500),
  rationale TEXT NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 5 AND 1500),
  source_category TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'exploring', 'active', 'archived')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.power_team_proposal_members (
  proposal_id UUID NOT NULL REFERENCES public.power_team_proposals(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_power_team_proposals_chapter_status
  ON public.power_team_proposals(chapter_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_power_team_proposal_members_member
  ON public.power_team_proposal_members(member_id);

ALTER TABLE public.power_team_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_team_proposal_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.power_team_proposals, public.power_team_proposal_members FROM anon, authenticated;

COMMENT ON TABLE public.power_team_proposals IS
  'Growth/MC proposals based on a shared intended customer group. Not an official Power Team or mentor-team assignment.';
