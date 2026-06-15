-- Migration 019 (2026-06-15): Backfill renewal dates from Reporting2You BNI Days
-- Renewal alerts depend on renewals.expiry_date. The current source of truth
-- for anniversary timing is Reporting2You bni_days from the latest sync.

WITH source_rows AS (
  SELECT
    m.id AS member_id,
    (CURRENT_DATE - (r.bni_days::int))::date AS joined_estimate
  FROM members m
  JOIN r2y_stats r ON r.member_id = m.id
  WHERE m.is_archived = false
    AND r.bni_days IS NOT NULL
    AND r.bni_days > 0
),
anniversary_rows AS (
  SELECT
    member_id,
    joined_estimate,
    make_date(
      EXTRACT(YEAR FROM CURRENT_DATE)::int,
      EXTRACT(MONTH FROM joined_estimate)::int,
      LEAST(
        EXTRACT(DAY FROM joined_estimate)::int,
        EXTRACT(DAY FROM (
          date_trunc(
            'month',
            make_date(
              EXTRACT(YEAR FROM CURRENT_DATE)::int,
              EXTRACT(MONTH FROM joined_estimate)::int,
              1
            )
          ) + INTERVAL '1 month - 1 day'
        ))::int
      )
    )::date AS anniversary_this_year
  FROM source_rows
),
computed_rows AS (
  SELECT
    member_id,
    CASE
      WHEN anniversary_this_year >= CURRENT_DATE THEN anniversary_this_year
      ELSE (anniversary_this_year + INTERVAL '1 year')::date
    END AS expiry_date,
    joined_estimate
  FROM anniversary_rows
)
INSERT INTO renewals (member_id, expiry_date, notes, updated_at)
SELECT
  member_id,
  expiry_date,
  'Synced from Reporting2You BNI Days; estimated join date ' || joined_estimate::text,
  NOW()
FROM computed_rows
ON CONFLICT (member_id) DO UPDATE SET
  expiry_date = EXCLUDED.expiry_date,
  notes = EXCLUDED.notes,
  updated_at = NOW();
