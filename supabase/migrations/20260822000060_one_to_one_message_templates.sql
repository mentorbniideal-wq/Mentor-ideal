ALTER TABLE public.matching_rounds
  ADD COLUMN IF NOT EXISTS message_template_key TEXT NOT NULL DEFAULT 'growth_opportunity';

ALTER TABLE public.matching_rounds
  DROP CONSTRAINT IF EXISTS matching_rounds_message_template_key_check;

ALTER TABLE public.matching_rounds
  ADD CONSTRAINT matching_rounds_message_template_key_check
  CHECK (message_template_key IN ('growth_opportunity','warm_connection','referral_focus','story_trust','quick_action'));

COMMENT ON COLUMN public.matching_rounds.message_template_key IS
  'MC-selected standard LINE message template for this weekly 1-2-1 round.';
