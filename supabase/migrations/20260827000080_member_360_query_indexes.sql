-- Member 360 opens on demand and reads pair history by participant. Existing
-- round indexes cannot serve these three predicates efficiently.
CREATE INDEX IF NOT EXISTS idx_matching_pairs_member_a_created
  ON public.matching_pairs(member_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matching_pairs_member_b_created
  ON public.matching_pairs(member_b_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matching_pairs_member_c_created
  ON public.matching_pairs(optional_member_c_id, created_at DESC)
  WHERE optional_member_c_id IS NOT NULL;

COMMENT ON INDEX public.idx_matching_pairs_member_a_created IS
  'Supports on-demand Member 360 pair history without slowing the member list.';

CREATE TABLE IF NOT EXISTS public.member_admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_role TEXT,
  actor_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_admin_events_member_created
  ON public.member_admin_events(member_id, created_at DESC);

ALTER TABLE public.member_admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_admin_events FROM anon, authenticated;

COMMENT ON TABLE public.member_admin_events IS
  'Privacy-safe audit trail for Chapter Admin actions; message bodies and PINs are never stored.';
