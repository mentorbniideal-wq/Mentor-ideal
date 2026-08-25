-- Mobile operator onboarding invitations.
-- Invitations are single-use, expire automatically and never store the raw token.

CREATE TABLE IF NOT EXISTS public.mobile_access_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  line_user_id TEXT,
  approved_role TEXT NOT NULL CHECK (approved_role IN ('mc','toomtam','aof','draft','phai','amp','growth')),
  approved_team_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','revoked','expired')),
  claimed_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mobile_access_invites_member_idx
  ON public.mobile_access_invitations(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mobile_access_invites_status_idx
  ON public.mobile_access_invitations(status, expires_at);

ALTER TABLE public.mobile_access_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_access_invitations FROM anon, authenticated;

COMMENT ON TABLE public.mobile_access_invitations IS
  'Single-use Chapter Admin invitations for binding a member to Google OAuth and Mentor Mobile access.';
COMMENT ON COLUMN public.mobile_access_invitations.token_hash IS
  'SHA-256 of the invitation token. The raw token is returned only when an invitation is created.';
