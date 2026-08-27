-- Explicit opt-in for sharing business and referral-focus fields chapter-wide.
-- Pair-scoped profile visibility remains unchanged.
ALTER TABLE public.member_one_to_one_profiles
  ADD COLUMN IF NOT EXISTS share_directory BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_121_profile_directory_opt_in
  ON public.member_one_to_one_profiles(updated_at DESC)
  WHERE share_directory = true;

COMMENT ON COLUMN public.member_one_to_one_profiles.share_directory IS
  'Member-controlled opt-in for Chapter Directory. Only business and referral-focus fields are projected; GAINS and private data are excluded.';
