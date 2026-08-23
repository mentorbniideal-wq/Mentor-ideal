-- Guided 1-2-1 Session. Additive only; pairs, verification, feedback and follow-up remain authoritative.
CREATE TABLE public.guided_one_to_one_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL UNIQUE REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.matching_rounds(id) ON DELETE CASCADE,
  session_mode TEXT NOT NULL DEFAULT 'discover' CHECK (session_mode IN ('discover','deepen','referral_focus')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  current_step SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 6),
  current_speaker_member_id UUID REFERENCES public.members(id),
  shared_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  timer_enabled BOOLEAN NOT NULL DEFAULT true,
  timer_started_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by_member_id UUID NOT NULL REFERENCES public.members(id),
  updated_by_member_id UUID NOT NULL REFERENCES public.members(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE public.guided_session_private_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.guided_one_to_one_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id),
  note_text TEXT NOT NULL DEFAULT '' CHECK (char_length(note_text) <= 8000),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE(session_id, member_id)
);

CREATE TABLE public.guided_referral_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.guided_one_to_one_sessions(id) ON DELETE CASCADE,
  owner_member_id UUID NOT NULL REFERENCES public.members(id),
  trigger_text TEXT NOT NULL CHECK (char_length(trigger_text) BETWEEN 1 AND 500),
  context TEXT CHECK (char_length(context) <= 1000),
  priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  owner_approved BOOLEAN NOT NULL DEFAULT false,
  actor_member_id UUID NOT NULL REFERENCES public.members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE public.guided_member_profile_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.guided_one_to_one_sessions(id) ON DELETE CASCADE,
  owner_member_id UUID NOT NULL REFERENCES public.members(id),
  proposed_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','applied','rejected')),
  actor_member_id UUID NOT NULL REFERENCES public.members(id),
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, owner_member_id)
);

CREATE INDEX idx_guided_sessions_pair_status ON public.guided_one_to_one_sessions(pair_id,status,updated_at DESC);
CREATE INDEX idx_guided_triggers_owner ON public.guided_referral_triggers(owner_member_id,is_active,updated_at DESC);
CREATE INDEX idx_guided_profile_drafts_owner ON public.guided_member_profile_drafts(owner_member_id,status);

ALTER TABLE public.guided_one_to_one_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_session_private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_referral_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_member_profile_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guided_one_to_one_sessions, public.guided_session_private_notes,
  public.guided_referral_triggers, public.guided_member_profile_drafts FROM anon, authenticated;

COMMENT ON TABLE public.guided_one_to_one_sessions IS 'Conversation state linked one-to-one with an existing matching pair; no duplicate verification or follow-up workflow.';
COMMENT ON COLUMN public.guided_one_to_one_sessions.shared_content IS 'Shared conversation data only. Never store private notes, mentor feedback, or handshake codes here.';
