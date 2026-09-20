-- Additive Mentor-to-Growth operational links. No existing work is rewritten.
ALTER TABLE public.growth_tasks
  ADD COLUMN IF NOT EXISTS source_signal_id UUID REFERENCES public.member_signals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.power_team_proposals(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_tasks_one_open_per_signal
  ON public.growth_tasks(source_signal_id)
  WHERE source_signal_id IS NOT NULL AND status NOT IN ('completed','cancelled');
ALTER TABLE public.power_team_proposals
  ADD COLUMN IF NOT EXISTS assigned_owner_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.power_team_proposals DROP CONSTRAINT IF EXISTS power_team_proposals_status_check;
ALTER TABLE public.power_team_proposals ADD CONSTRAINT power_team_proposals_status_check
  CHECK (status IN ('proposed','draft','assigned','exploring','active','closed','archived'));
ALTER TABLE public.power_team_proposals ALTER COLUMN status SET DEFAULT 'draft';
CREATE TABLE IF NOT EXISTS public.growth_task_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  growth_task_id UUID NOT NULL REFERENCES public.growth_tasks(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('connection_introduced','my121_verified','referral_reported','business_outcome_reported')),
  matching_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE RESTRICT,
  safe_summary TEXT NOT NULL DEFAULT '' CHECK (char_length(safe_summary) <= 1000),
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(growth_task_id, stage, matching_pair_id)
);
CREATE INDEX IF NOT EXISTS idx_growth_task_stage_events_chapter_task ON public.growth_task_stage_events(chapter_id, growth_task_id, recorded_at DESC);
CREATE TABLE IF NOT EXISTS public.member_growth_category_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  category_type TEXT NOT NULL CHECK (category_type IN ('looking_for','power_team')),
  category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 120),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  actor_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  UNIQUE(member_id, category_type, category)
);
CREATE INDEX IF NOT EXISTS idx_growth_category_consent_active ON public.member_growth_category_consents(member_id, category_type) WHERE revoked_at IS NULL;
ALTER TABLE public.growth_task_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_growth_category_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_task_stage_events, public.member_growth_category_consents FROM anon, authenticated;
