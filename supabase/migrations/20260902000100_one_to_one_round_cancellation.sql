-- Safe lifecycle for test rounds and mistakenly delivered 1-2-1 rounds.
ALTER TABLE public.matching_rounds
  DROP CONSTRAINT IF EXISTS matching_rounds_status_check;

ALTER TABLE public.matching_rounds
  ADD CONSTRAINT matching_rounds_status_check
  CHECK (status IN ('draft','confirmed','sending','sent','partially_failed','cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS replaces_round_id UUID REFERENCES public.matching_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matching_rounds_replaces
  ON public.matching_rounds(replaces_round_id);
