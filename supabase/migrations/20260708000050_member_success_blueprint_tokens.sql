-- Member Success Blueprint personal form links.
-- LINE webhook creates short-lived tokens after it has already resolved the
-- sender's line_user_id to a member_id. The public form then uses this token
-- instead of LIFF login, avoiding LINE Login/developing-status friction.

CREATE TABLE IF NOT EXISTS public.member_success_blueprint_tokens (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash              TEXT NOT NULL UNIQUE,
  expires_at              TIMESTAMPTZ NOT NULL,
  revoked_at              TIMESTAMPTZ,
  created_by_line_user_id TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_msb_tokens_member
  ON public.member_success_blueprint_tokens(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_msb_tokens_active
  ON public.member_success_blueprint_tokens(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.member_success_blueprint_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_success_blueprint_tokens FROM anon, authenticated;

COMMENT ON TABLE public.member_success_blueprint_tokens IS
  'Short-lived personal links for Member Success Blueprint forms. Stores only SHA-256 token hashes.';
