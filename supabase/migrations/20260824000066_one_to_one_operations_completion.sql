-- Complete the operational lifecycle without duplicating existing 1-2-1 tables.
-- Additive and reversible: existing rows retain their current values.

ALTER TABLE public.matching_pairs
  ADD COLUMN IF NOT EXISTS care_owner_role TEXT,
  ADD COLUMN IF NOT EXISTS care_snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contacted_by TEXT;

ALTER TABLE public.one_to_one_schedules
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS changed_by TEXT;

ALTER TABLE public.one_to_one_follow_up_actions
  ADD COLUMN IF NOT EXISTS outcome_stage TEXT,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_updated_by TEXT;

ALTER TABLE public.one_to_one_follow_up_actions
  DROP CONSTRAINT IF EXISTS one_to_one_follow_up_actions_outcome_stage_check;
ALTER TABLE public.one_to_one_follow_up_actions
  ADD CONSTRAINT one_to_one_follow_up_actions_outcome_stage_check CHECK (
    outcome_stage IS NULL OR outcome_stage IN (
      'connection_identified','permission_requested','permission_granted',
      'introduction_sent','meeting_booked','referral_created','collaboration',
      'won','not_ready','not_a_fit','learning_only'
    )
  );

ALTER TABLE public.one_to_one_attention_items
  DROP CONSTRAINT IF EXISTS one_to_one_attention_items_status_check;
ALTER TABLE public.one_to_one_attention_items
  ADD CONSTRAINT one_to_one_attention_items_status_check CHECK (status IN (
    'open','reviewed','in_progress','waiting_member','snoozed','resolved',
    'no_action_required'
  ));

CREATE INDEX IF NOT EXISTS idx_121_attention_inbox
  ON public.one_to_one_attention_items(status, assigned_role, due_date)
  WHERE status IN ('open','reviewed','in_progress','waiting_member','snoozed');

CREATE INDEX IF NOT EXISTS idx_121_follow_up_outcome_stage
  ON public.one_to_one_follow_up_actions(outcome_stage, updated_at);

COMMENT ON COLUMN public.one_to_one_follow_up_actions.outcome_stage IS
  'Referral/connection lifecycle stored on the existing commitment record.';
COMMENT ON COLUMN public.matching_pairs.care_owner_role IS
  'Mentor/MC role currently responsible for operational follow-up.';
