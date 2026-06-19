-- Migration 024: Access Requests
-- Stores pending requests from Google-authenticated users who aren't in role_assignments

CREATE TABLE IF NOT EXISTS public.access_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL,
  name                TEXT,
  requested_sections  TEXT[]      DEFAULT '{}',
  edit_access         BOOLEAN     DEFAULT false,
  reason              TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         TEXT
);

CREATE INDEX IF NOT EXISTS access_requests_status_idx ON public.access_requests (status);
CREATE INDEX IF NOT EXISTS access_requests_email_idx  ON public.access_requests (email);

-- No RLS needed — only service role reads/writes this table via Edge Functions
