-- Preserve a closed 1-2-1 journey while allowing an MC-approved re-match.
-- This is additive: no historical pair, schedule, feedback, or delivery is deleted.

ALTER TABLE public.matching_pairs DROP CONSTRAINT IF EXISTS matching_pairs_status_check;
ALTER TABLE public.matching_pairs ADD CONSTRAINT matching_pairs_status_check CHECK (status IN (
  'matched','contacted','scheduled','confirmed_schedule','awaiting_verification',
  'partially_verified','verified','late_verified','overdue','unable_to_contact',
  'missed_appointment','cancelled','released','expired','superseded'
));

ALTER TABLE public.matching_pairs
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by TEXT,
  ADD COLUMN IF NOT EXISTS release_reason TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.one_to_one_rematch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','consumed','withdrawn','cancelled')),
  priority_points INTEGER NOT NULL DEFAULT 1 CHECK (priority_points >= 0),
  reason TEXT NOT NULL,
  released_by TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_by_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pair_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_121_rematch_requests_waiting
  ON public.one_to_one_rematch_requests(member_id, priority_points DESC, released_at)
  WHERE status = 'waiting';

ALTER TABLE public.one_to_one_rematch_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.one_to_one_rematch_requests FROM anon, authenticated;

COMMENT ON TABLE public.one_to_one_rematch_requests IS
  'MC-approved re-match queue. A request is considered only when its member appears in a later eligible matching round.';
COMMENT ON COLUMN public.matching_pairs.release_reason IS
  'MC-provided reason for closing an unfinished pair for re-match; historic journey remains immutable.';
