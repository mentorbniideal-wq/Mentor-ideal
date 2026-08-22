-- 1-2-1 System foundation. Additive migration; legacy groups of three remain readable.

ALTER TABLE public.matching_rounds
  ADD COLUMN IF NOT EXISTS system_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  ADD COLUMN IF NOT EXISTS opt_in_closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cross_pool_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_flag TEXT NOT NULL DEFAULT 'legacy_weekly_121';

ALTER TABLE public.matching_pairs
  ADD COLUMN IF NOT EXISTS match_reason JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS matching_score NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS constraint_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'matched',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE public.round_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.matching_rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id),
  source TEXT NOT NULL CHECK (source IN ('attendee','absent_opt_in','owner_opt_in','manual')),
  status TEXT NOT NULL DEFAULT 'eligible' CHECK (status IN ('eligible','opt_in_requested','opted_out','excluded','waiting','matched')),
  preference TEXT NOT NULL DEFAULT 'ask' CHECK (preference IN ('ask','auto','never')),
  priority_points INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, member_id)
);

CREATE TABLE public.pairing_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.matching_rounds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','proposed','matched','carried','withdrawn')),
  priority_points INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT 'odd_pool',
  proposed_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, member_id)
);

CREATE TABLE public.one_to_one_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES public.members(id),
  confirmed_by_a_at TIMESTAMPTZ,
  confirmed_by_b_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 15 AND 240),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  meeting_mode TEXT NOT NULL CHECK (meeting_mode IN ('in_person','phone','video','other')),
  location_or_link TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','rescheduled','cancelled','missed')),
  stable_event_uid TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.one_to_one_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id),
  code_hash TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  flow_started_at TIMESTAMPTZ,
  verified_partner_code_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pair_id, member_id)
);

CREATE TABLE public.one_to_one_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  respondent_member_id UUID NOT NULL REFERENCES public.members(id),
  about_member_id UUID NOT NULL REFERENCES public.members(id),
  visibility TEXT NOT NULL CHECK (visibility IN ('shared','private_mentor')),
  learned TEXT,
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action_type TEXT,
  next_action_detail TEXT,
  usefulness SMALLINT CHECK (usefulness BETWEEN 1 AND 5),
  cooperation SMALLINT CHECK (cooperation BETWEEN 1 AND 5),
  mentor_help TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CHECK (respondent_member_id <> about_member_id)
);

CREATE TABLE public.one_to_one_follow_up_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  description TEXT,
  owner_member_id UUID NOT NULL REFERENCES public.members(id),
  related_member_id UUID NOT NULL REFERENCES public.members(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled','overdue')),
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.one_to_one_attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id),
  pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('normal','watch','follow_up_recommended','mentor_assistance_required','mentor_review_required')),
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  positive_context JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_action TEXT,
  assigned_role TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','snoozed','resolved','no_action_required')),
  resolution TEXT,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE public.one_to_one_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.matching_rounds(id) ON DELETE CASCADE,
  pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_ref TEXT,
  idempotency_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.member_contact_preferences (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  preferred_channel TEXT NOT NULL DEFAULT 'line' CHECK (preferred_channel IN ('line','phone','email','other')),
  preferred_time TEXT,
  contact_value TEXT,
  share_consent BOOLEAN NOT NULL DEFAULT false,
  matching_preference TEXT NOT NULL DEFAULT 'ask' CHECK (matching_preference IN ('ask','auto','never')),
  reminders_paused_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_budget_config (
  module TEXT PRIMARY KEY,
  monthly_hard_cap INTEGER NOT NULL CHECK (monthly_hard_cap > 0),
  target_min INTEGER NOT NULL DEFAULT 0,
  target_max INTEGER NOT NULL DEFAULT 0,
  daily_member_cap INTEGER NOT NULL DEFAULT 1,
  weekly_reminder_cap INTEGER NOT NULL DEFAULT 3,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  quiet_hours_start TIME NOT NULL DEFAULT '20:00',
  quiet_hours_end TIME NOT NULL DEFAULT '08:00',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.notification_budget_config(module, monthly_hard_cap, target_min, target_max)
VALUES ('global',15000,1200,2000), ('one_to_one',3000,800,1500)
ON CONFLICT (module) DO NOTHING;

CREATE INDEX idx_round_eligibility_round_status ON public.round_eligibility(round_id,status);
CREATE INDEX idx_pairing_waitlist_status_priority ON public.pairing_waitlist(status,priority_points DESC,created_at);
CREATE INDEX idx_121_schedules_pair ON public.one_to_one_schedules(pair_id,created_at DESC);
CREATE INDEX idx_121_feedback_relationship ON public.one_to_one_feedback(respondent_member_id,about_member_id,created_at DESC);
CREATE INDEX idx_121_follow_up_owner_status ON public.one_to_one_follow_up_actions(owner_member_id,status,due_date);
CREATE INDEX idx_121_attention_queue ON public.one_to_one_attention_items(status,level,due_date);
CREATE INDEX idx_121_events_pair ON public.one_to_one_status_events(pair_id,created_at);

ALTER TABLE public.round_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_follow_up_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_contact_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_budget_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.round_eligibility, public.pairing_waitlist, public.one_to_one_schedules,
  public.one_to_one_verifications, public.one_to_one_feedback, public.one_to_one_follow_up_actions,
  public.one_to_one_attention_items, public.one_to_one_status_events, public.member_contact_preferences,
  public.notification_budget_config FROM anon, authenticated;

-- New-system rounds can never persist a group of three. Version 1 rows remain untouched.
CREATE OR REPLACE FUNCTION public.enforce_two_member_new_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_version SMALLINT;
BEGIN
  SELECT system_version INTO v_version FROM public.matching_rounds WHERE id = NEW.round_id;
  IF COALESCE(v_version,1) >= 2 AND NEW.optional_member_c_id IS NOT NULL THEN
    RAISE EXCEPTION 'New 1-2-1 pairs must contain exactly two members';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_two_member_new_pair ON public.matching_pairs;
CREATE TRIGGER trg_enforce_two_member_new_pair
BEFORE INSERT OR UPDATE ON public.matching_pairs
FOR EACH ROW EXECUTE FUNCTION public.enforce_two_member_new_pair();

INSERT INTO public.settings(key,value) VALUES
  ('FEATURE_ONE_TO_ONE_SYSTEM','false'),
  ('ONE_TO_ONE_DEFAULT_TIMEZONE','Asia/Bangkok'),
  ('ONE_TO_ONE_REPEAT_WINDOW_WEEKS','12')
ON CONFLICT (key) DO NOTHING;
