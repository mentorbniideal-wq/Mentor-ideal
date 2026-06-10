-- ============================================================
-- Migration 002: Score Tables
-- r2y_stats (Reporting2You snapshot) + monthly_scores (Traffic Light history)
-- ============================================================

-- ============================================================
-- r2y_stats — latest Reporting2You snapshot per member
-- Source: Reporting2You sheet (one row per member, cumulative per period)
-- One row per member — upserted on each CSV import
-- ============================================================
CREATE TABLE r2y_stats (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- BNI performance columns (maps to R2Y cols 2-14)
  rg           INT         NOT NULL DEFAULT 0,        -- referrals given (RGI)
  rr           INT         NOT NULL DEFAULT 0,        -- referrals received
  visitors     INT         NOT NULL DEFAULT 0,        -- visitors brought
  one_to_one   INT         NOT NULL DEFAULT 0,        -- 1-2-1 meetings
  ceu          NUMERIC(5,1) NOT NULL DEFAULT 0,       -- CEU points
  tyfcb_thb    NUMERIC(14,2) NOT NULL DEFAULT 0,      -- TYFCB in THB
  official_pts NUMERIC(5,1) NOT NULL DEFAULT 0,       -- BNI official score (col 8 Points)
  bni_days     INT         NOT NULL DEFAULT 0,        -- membership age in days (col 9)
  -- Attendance breakdown (PALMS components)
  attend       INT         NOT NULL DEFAULT 0,        -- P — present
  absent       INT         NOT NULL DEFAULT 0,        -- A — absent
  late         INT         NOT NULL DEFAULT 0,        -- L — late
  medical      INT         NOT NULL DEFAULT 0,        -- M — medical leave
  sub          INT         NOT NULL DEFAULT 0,        -- S — sent substitute
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id)
);

CREATE INDEX idx_r2y_stats_member ON r2y_stats(member_id);

COMMENT ON TABLE r2y_stats IS
  'Latest Reporting2You snapshot. official_pts = BNI Connect score; '
  'display rule: GREATEST(official_pts, latest monthly_score).';

-- ============================================================
-- monthly_scores — Traffic Light CSV score history
-- Replaces wide-format columns E(JAN)…P(DEC) in mentor sheets.
-- Normalized to (member, year, month) → unlimited history across years.
-- ============================================================
CREATE TABLE monthly_scores (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year       INT         NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month      INT         NOT NULL CHECK (month >= 1 AND month <= 12),
  score      NUMERIC(5,1) NOT NULL CHECK (score >= 0 AND score <= 100),
  -- source distinguishes CSV import from manual override
  source     TEXT        NOT NULL DEFAULT 'traffic_light_csv'
             CHECK (source IN ('traffic_light_csv', 'manual')),
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, year, month)
);

CREATE INDEX idx_monthly_scores_member  ON monthly_scores(member_id);
CREATE INDEX idx_monthly_scores_period  ON monthly_scores(year DESC, month DESC);
-- Fast lookup: latest score per member
CREATE INDEX idx_monthly_scores_latest  ON monthly_scores(member_id, year DESC, month DESC);

COMMENT ON TABLE monthly_scores IS
  'Traffic Light monthly score history. '
  'Covers ALL members including non-mentored (President, LT mentors). '
  'Replaces JAN-DEC columns in individual mentor sheets.';

COMMENT ON COLUMN monthly_scores.source IS
  'traffic_light_csv = synced from BNI Connect export; manual = MC override.';
