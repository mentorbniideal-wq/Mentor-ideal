-- Monthly snapshots for the five activity keys shown in LINE history:
-- Referral, Visitor, 1-2-1, CEU, and TYFCB.

CREATE TABLE IF NOT EXISTS palms_key_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year           INT NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month          INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  referral_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  visitor_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  one_to_one_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  ceu_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tyfcb_value    NUMERIC(14,2) NOT NULL DEFAULT 0,
  referral_pts   INT NOT NULL DEFAULT 0,
  visitor_pts    INT NOT NULL DEFAULT 0,
  one_to_one_pts INT NOT NULL DEFAULT 0,
  ceu_pts        INT NOT NULL DEFAULT 0,
  tyfcb_pts      INT NOT NULL DEFAULT 0,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_palms_key_snapshots_member_period
  ON palms_key_snapshots(member_id, year DESC, month DESC);

-- Seed the current known period so members can see a baseline immediately.
WITH latest_period AS (
  SELECT year, month
  FROM monthly_scores
  ORDER BY year DESC, month DESC
  LIMIT 1
),
scored AS (
  SELECT
    r.*,
    fn_palms_score(
      r.attend, r.absent, r.late, r.medical, r.sub,
      r.rg, 0, r.visitors, r.one_to_one, r.ceu, r.tyfcb_thb
    ) AS detail
  FROM r2y_stats r
)
INSERT INTO palms_key_snapshots (
  member_id, year, month,
  referral_value, visitor_value, one_to_one_value, ceu_value, tyfcb_value,
  referral_pts, visitor_pts, one_to_one_pts, ceu_pts, tyfcb_pts,
  captured_at
)
SELECT
  s.member_id, p.year, p.month,
  s.rg, s.visitors, s.one_to_one, s.ceu, s.tyfcb_thb,
  COALESCE((s.detail->>'referral')::INT, 0),
  COALESCE((s.detail->>'visitor')::INT, 0),
  COALESCE((s.detail->>'oneToOne')::INT, 0),
  COALESCE((s.detail->>'ceu')::INT, 0),
  COALESCE((s.detail->>'tyfb')::INT, 0),
  s.synced_at
FROM scored s
CROSS JOIN latest_period p
ON CONFLICT (member_id, year, month) DO NOTHING;

ALTER TABLE palms_key_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE palms_key_snapshots IS
  'Monthly five-key activity and PALMS point snapshots captured during monthly sync.';

