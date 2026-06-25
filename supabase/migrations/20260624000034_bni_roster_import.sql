-- BNI Connect Chapter Roster import support
-- Stores stable profile fields and non-authoritative 90-day activity snapshots.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS profession TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS roster_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN members.profession IS
  'Latest profession/seat imported from BNI Connect Chapter Roster.';

COMMENT ON COLUMN members.company_name IS
  'Latest company name imported from BNI Connect Chapter Roster.';

COMMENT ON COLUMN members.roster_synced_at IS
  'Timestamp when Chapter Roster profile fields were last synced.';

CREATE TABLE IF NOT EXISTS bni_roster_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  report_run_at           TIMESTAMPTZ NOT NULL,
  report_chapter          TEXT,
  raw_name                TEXT NOT NULL,
  profession              TEXT,
  company_name            TEXT,
  phone                   TEXT,
  referrals_given_90d     INT NOT NULL DEFAULT 0,
  referrals_received_90d  INT NOT NULL DEFAULT 0,
  visitors_90d            INT NOT NULL DEFAULT 0,
  one_to_one_90d          INT NOT NULL DEFAULT 0,
  late_90d                INT NOT NULL DEFAULT 0,
  absent_90d              INT NOT NULL DEFAULT 0,
  raw                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, report_run_at)
);

CREATE INDEX IF NOT EXISTS idx_bni_roster_snapshots_member_run
  ON bni_roster_snapshots(member_id, report_run_at DESC);

CREATE INDEX IF NOT EXISTS idx_bni_roster_snapshots_imported
  ON bni_roster_snapshots(imported_at DESC);

ALTER TABLE bni_roster_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_bni_roster_snapshots" ON bni_roster_snapshots;
CREATE POLICY "service_role_all_bni_roster_snapshots"
  ON bni_roster_snapshots FOR ALL TO service_role USING (true);

COMMENT ON TABLE bni_roster_snapshots IS
  'BNI Connect Chapter Roster snapshots. 90-day metrics are advisory and must not override monthly PALMS source of truth.';

CREATE TABLE IF NOT EXISTS bni_palms_summary_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period_from             DATE NOT NULL,
  period_to               DATE NOT NULL,
  report_run_at           TIMESTAMPTZ,
  report_chapter          TEXT,
  raw_name                TEXT NOT NULL,
  present                 INT NOT NULL DEFAULT 0,
  absent                  INT NOT NULL DEFAULT 0,
  late                    INT NOT NULL DEFAULT 0,
  medical                 INT NOT NULL DEFAULT 0,
  substitute              INT NOT NULL DEFAULT 0,
  rgi                     INT NOT NULL DEFAULT 0,
  rgo                     INT NOT NULL DEFAULT 0,
  rri                     INT NOT NULL DEFAULT 0,
  rro                     INT NOT NULL DEFAULT 0,
  visitors                INT NOT NULL DEFAULT 0,
  one_to_one              INT NOT NULL DEFAULT 0,
  revenue_given_thb       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ceu                     NUMERIC(5,1) NOT NULL DEFAULT 0,
  revenue_received_thb    NUMERIC(14,2) NOT NULL DEFAULT 0,
  calculated_score        NUMERIC(5,1) NOT NULL DEFAULT 0,
  calculated_color        TEXT NOT NULL DEFAULT 'black',
  palms_detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_bni_palms_summary_member_period
  ON bni_palms_summary_snapshots(member_id, period_to DESC, period_from DESC);

CREATE INDEX IF NOT EXISTS idx_bni_palms_summary_imported
  ON bni_palms_summary_snapshots(imported_at DESC);

ALTER TABLE bni_palms_summary_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_bni_palms_summary_snapshots" ON bni_palms_summary_snapshots;
CREATE POLICY "service_role_all_bni_palms_summary_snapshots"
  ON bni_palms_summary_snapshots FOR ALL TO service_role USING (true);

COMMENT ON TABLE bni_palms_summary_snapshots IS
  'BNI Connect Summary PALMS raw period snapshots. These can refresh r2y_stats after MC preview/confirmation.';
