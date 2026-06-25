-- Preserve the right-most Average column from Traffic Lights Evolution imports.
-- Historical rows are backfilled from the same monthly score history so the
-- LINE "ประวัติ" card can show a value immediately. The next Evolution sync
-- overwrites this with the exact value exported by BNI Connect.

CREATE TABLE IF NOT EXISTS traffic_light_evolution_summary (
  member_id      UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  average_score  NUMERIC(5,1) NOT NULL CHECK (average_score >= 0 AND average_score <= 100),
  source_column  TEXT NOT NULL DEFAULT 'calculated_history',
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO traffic_light_evolution_summary (member_id, average_score, source_column, synced_at)
SELECT
  member_id,
  ROUND(AVG(score), 1),
  'calculated_history',
  MAX(synced_at)
FROM monthly_scores
WHERE score > 0
GROUP BY member_id
ON CONFLICT (member_id) DO NOTHING;

ALTER TABLE traffic_light_evolution_summary ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE traffic_light_evolution_summary IS
  'Per-member Average from the right-most column of Traffic Lights Evolution. '
  'Backfilled from monthly_scores until the next exact CSV sync.';

