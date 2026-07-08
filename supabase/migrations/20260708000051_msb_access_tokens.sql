-- Member Success Blueprint secure web access links.
--
-- This table supports normal-browser member form links without LINE LIFF.
-- Tokens are long random strings, do not expose member_id, and are reusable
-- for editing until they expire.
CREATE TABLE IF NOT EXISTS public.msb_access_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  blueprint_year INT NOT NULL CHECK (blueprint_year >= 2020 AND blueprint_year <= 2100),
  expires_at     TIMESTAMPTZ,
  used_at        TIMESTAMPTZ,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, blueprint_year)
);

CREATE INDEX IF NOT EXISTS idx_msb_access_tokens_member_year
  ON public.msb_access_tokens(member_id, blueprint_year);

CREATE INDEX IF NOT EXISTS idx_msb_access_tokens_expires_at
  ON public.msb_access_tokens(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.msb_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.msb_access_tokens FROM anon, authenticated;

COMMENT ON TABLE public.msb_access_tokens IS
  'Secure member-specific web links for Member Success Blueprint forms. Service-role access only.';

COMMENT ON COLUMN public.msb_access_tokens.token IS
  'Long random opaque token used in /member-success-blueprint?t=TOKEN. Never expose member_id in the URL.';
