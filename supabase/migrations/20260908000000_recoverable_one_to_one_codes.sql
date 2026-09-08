-- Allow a member to reopen their own 1-2-1 verification code without storing
-- the six-digit secret in plaintext. Legacy rows remain NULL and require an
-- authorized Mentor/MC reissue before they become recoverable.

ALTER TABLE public.one_to_one_verifications
  ADD COLUMN IF NOT EXISTS code_version INTEGER;

ALTER TABLE public.one_to_one_verifications
  DROP CONSTRAINT IF EXISTS one_to_one_verifications_code_version_check;

ALTER TABLE public.one_to_one_verifications
  ADD CONSTRAINT one_to_one_verifications_code_version_check
  CHECK (code_version IS NULL OR code_version BETWEEN 1 AND 2147483647);

COMMENT ON COLUMN public.one_to_one_verifications.code_version IS
  'Non-secret version used with the server-only pepper to reconstruct an active handshake code. NULL identifies legacy non-recoverable codes.';
