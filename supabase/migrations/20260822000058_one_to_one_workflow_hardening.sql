-- Workflow hardening after the additive 1-2-1 foundation.

CREATE UNIQUE INDEX IF NOT EXISTS uq_121_feedback_response_visibility
  ON public.one_to_one_feedback(pair_id, respondent_member_id, visibility)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_121_verification_expiry
  ON public.one_to_one_verifications(code_expires_at)
  WHERE verified_partner_code_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_121_schedules_confirmed
  ON public.one_to_one_schedules(starts_at)
  WHERE status = 'confirmed';

ALTER TABLE public.matching_pairs DROP CONSTRAINT IF EXISTS matching_pairs_status_check;
ALTER TABLE public.matching_pairs ADD CONSTRAINT matching_pairs_status_check CHECK (status IN (
  'matched','contacted','scheduled','confirmed_schedule','awaiting_verification',
  'partially_verified','verified','late_verified','overdue','unable_to_contact',
  'missed_appointment','cancelled'
));

COMMENT ON COLUMN public.one_to_one_verifications.code_hash IS
  'SHA-256 hash bound to pair, owning member, six-digit code, and ONE_TO_ONE_CODE_PEPPER. Never store plaintext.';

COMMENT ON TABLE public.one_to_one_feedback IS
  'Shared reflections may be shown to both pair members and authorized mentors. private_mentor rows must never be returned to the other member.';
