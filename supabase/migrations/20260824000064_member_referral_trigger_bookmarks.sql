-- Member-owned memory aid for approved Referral Triggers.
-- Triggers, pairs and relationship history remain authoritative in their existing tables.
CREATE TABLE public.member_referral_trigger_bookmarks (
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES public.guided_referral_triggers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, trigger_id)
);

CREATE INDEX idx_member_trigger_bookmarks_member_created
  ON public.member_referral_trigger_bookmarks(member_id, created_at DESC);

ALTER TABLE public.member_referral_trigger_bookmarks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_referral_trigger_bookmarks FROM anon, authenticated;

COMMENT ON TABLE public.member_referral_trigger_bookmarks IS
  'A member-owned pointer to an existing owner-approved Referral Trigger; accessed only through identity-checked server endpoints.';
