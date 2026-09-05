-- Keep imported BNI membership facts separate from human workflow notes.
ALTER TABLE public.renewals
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_metadata) = 'object');

COMMENT ON COLUMN public.renewals.source_metadata IS
  'Machine-readable source facts. Human follow-up context remains in notes and is never overwritten by report imports.';
