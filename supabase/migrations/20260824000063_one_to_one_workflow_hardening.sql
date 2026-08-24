-- 1-2-1 workflow hardening: make derived work items idempotent without
-- replacing any existing Pair, Feedback, Attention, or Follow-up records.

ALTER TABLE public.one_to_one_follow_up_actions
  ADD COLUMN IF NOT EXISTS source_feedback_id UUID REFERENCES public.one_to_one_feedback(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_guided_session_id UUID REFERENCES public.guided_one_to_one_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_121_follow_up_feedback
  ON public.one_to_one_follow_up_actions(source_feedback_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_121_follow_up_guided_commitment
  ON public.one_to_one_follow_up_actions(
    source_guided_session_id,
    owner_member_id,
    action_type,
    COALESCE(description, ''),
    COALESCE(due_date, DATE '1900-01-01')
  );

ALTER TABLE public.one_to_one_attention_items
  ADD COLUMN IF NOT EXISTS source_feedback_id UUID REFERENCES public.one_to_one_feedback(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_121_attention_feedback
  ON public.one_to_one_attention_items(source_feedback_id);

ALTER TABLE public.guided_referral_triggers
  ADD COLUMN IF NOT EXISTS client_action_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_guided_trigger_client_action
  ON public.guided_referral_triggers(client_action_id);

ALTER TABLE public.biz_profiles
  ADD COLUMN IF NOT EXISTS looking_for TEXT,
  ADD COLUMN IF NOT EXISTS ideal_client TEXT,
  ADD COLUMN IF NOT EXISTS referral_trigger_summary TEXT;

INSERT INTO public.settings(key, value)
VALUES ('ONE_TO_ONE_ENFORCE_PILOT_ACCESS', 'false')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.one_to_one_follow_up_actions.source_feedback_id IS
  'Idempotency link for a Next Action created from one shared Reflection.';
COMMENT ON COLUMN public.one_to_one_follow_up_actions.source_guided_session_id IS
  'Idempotency link for Commitments created when completing a Guided Session.';
COMMENT ON COLUMN public.one_to_one_attention_items.source_feedback_id IS
  'Idempotency link for a private Mentor request; one open care item per Feedback.';
