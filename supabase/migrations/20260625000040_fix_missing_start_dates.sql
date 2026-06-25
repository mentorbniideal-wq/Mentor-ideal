-- Migration 040: Fix 4 members with missing membership_start_date
-- Seat transfer: Thanakrit Wathport → Sumintra Putthakee (June 2026)

-- 1. Sornram Arjvichai (แชมป์, Aof) — joined June 2026
UPDATE members
SET membership_start_date = '2026-06-01',
    joined_date            = '2026-06-01'
WHERE name = 'Sornram Arjvichai';

-- 2. Preyawal Vatcharachaithanin (เตย, TOOMTAM) — joined August 2025
UPDATE members
SET membership_start_date = '2025-08-01',
    joined_date            = '2025-08-01'
WHERE name = 'Preyawal Vatcharachaithanin';

-- 3. Ploypachcha Tararattanapawn (เมย์, Aof) — joined April 2024
UPDATE members
SET membership_start_date = '2024-04-01',
    joined_date            = '2024-04-01'
WHERE name = 'Ploypachcha Tararattanapawn';

-- 4. Seat transfer: Thanakrit Wathport → Sumintra Putthakee (June 2026)
--    Clear score history for the previous seat holder.
UPDATE members
SET name                  = 'Sumintra Putthakee',
    membership_start_date = '2026-06-01',
    joined_date           = '2026-06-01'
WHERE name = 'Thanakrit Wathport';

DELETE FROM monthly_scores
WHERE member_id = (SELECT id FROM members WHERE name = 'Sumintra Putthakee');

-- 5. Refresh renewals table for all 4 members
-- Formula: membership_start_date + (years elapsed + 1) = next upcoming anniversary
INSERT INTO renewals (member_id, expiry_date)
SELECT
  m.id,
  (m.membership_start_date +
    ((EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.membership_start_date))::INT + 1)
     * INTERVAL '1 year'))::DATE AS expiry_date
FROM members m
WHERE m.name IN ('Sornram Arjvichai', 'Preyawal Vatcharachaithanin',
                 'Ploypachcha Tararattanapawn', 'Sumintra Putthakee')
ON CONFLICT (member_id) DO UPDATE
  SET expiry_date = EXCLUDED.expiry_date;
