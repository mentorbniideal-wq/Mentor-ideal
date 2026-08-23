-- Short-lived, single-use Visitor QR credentials.
-- The QR contains only the random plaintext token; the database stores its SHA-256 hash.
CREATE TABLE IF NOT EXISTS visitor_checkin_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_log_id        UUID NOT NULL REFERENCES visitor_log(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  created_by_member_id  UUID NOT NULL REFERENCES members(id),
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_at           TIMESTAMPTZ,
  consumed_by_member_id UUID REFERENCES members(id),
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visitor_checkin_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT visitor_checkin_consumption_complete CHECK (
    (consumed_at IS NULL AND consumed_by_member_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_by_member_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_visitor_checkin_tokens_visitor
  ON visitor_checkin_tokens(visitor_log_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_checkin_tokens_expiry
  ON visitor_checkin_tokens(expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE visitor_checkin_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visitor_checkin_tokens FROM anon, authenticated;

COMMENT ON TABLE visitor_checkin_tokens IS
  'Short-lived single-use Visitor QR tokens. Plaintext tokens must never be persisted or logged.';

