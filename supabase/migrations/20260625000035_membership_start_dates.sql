-- Migration 035: Membership start dates from BNI Connect "Length of Membership Report"
-- Source: Exported 2026-06-25 by Phitarn Sakulthanaphetch, Chapter BNI Ideal
-- Uses "Recent Start Date" column (current chapter membership start, not cumulative).
-- Matching via normalized English name (lowercase, alphanumeric only).

-- ── Add column ──────────────────────────────────────────────────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS membership_start_date DATE;

COMMENT ON COLUMN members.membership_start_date IS
  'Date this member started their current BNI chapter membership (from BNI Connect Length of Membership report, Recent Start Date column).';

-- ── Import start dates ───────────────────────────────────────────────
-- normalize(name) = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
WITH import_data(norm_name, start_date) AS (
  VALUES
    ('adisakpankhot',             DATE '2024-04-01'),
    ('archarapagarat',            DATE '2024-04-01'),
    ('atiwatboonprom',            DATE '2026-06-01'),
    ('atthachaisomboon',          DATE '2026-02-01'),
    ('chananansaengdao',          DATE '2024-04-01'),
    ('chananansaengplao',         DATE '2024-04-01'),  -- alt spelling in DB
    ('chananphatpunnanitinont',   DATE '2026-05-01'),
    ('chiranansathitsamphan',     DATE '2024-12-01'),
    ('chiraphonchumphon',         DATE '2026-06-01'),
    ('duangkamonchanthaboon',     DATE '2025-05-01'),
    ('ekawatsuwannahong',         DATE '2025-08-01'),
    ('gomenkhotsopa',             DATE '2024-10-01'),
    ('itthipolrattanapirote',     DATE '2025-06-01'),
    ('ittiponsetthawattananon',   DATE '2026-02-01'),
    ('jakrapongvisetpanpong',     DATE '2024-04-01'),
    ('jatsadasanudomchok',        DATE '2025-08-01'),
    ('jetsadasanudomchok',        DATE '2025-08-01'),  -- alt spelling
    ('jirayuboonlert',            DATE '2024-04-01'),
    ('kanoknatnakhonthai',        DATE '2025-06-01'),
    ('kanokwankaewwanna',         DATE '2026-06-01'),
    ('kanpongritchainimit',       DATE '2024-06-01'),
    ('kittathatjaruchaikul',      DATE '2024-04-01'),
    ('korranatworawongthep',      DATE '2024-04-01'),
    ('krisadakotama',             DATE '2026-02-01'),
    ('nantawatmahaeknan',         DATE '2024-04-01'),
    ('narinlounujirakul',         DATE '2025-04-01'),
    ('narinlourujirakul',         DATE '2025-04-01'),  -- alt spelling
    ('naruponsupittayapornpong',  DATE '2024-04-01'),
    ('narupornsupittayapornpong', DATE '2024-04-01'),  -- alt spelling
    ('nattawutamsri',             DATE '2026-01-01'),
    ('nalinwaroha',               DATE '2025-09-01'),
    ('nilinwaroha',               DATE '2025-09-01'),  -- alt spelling
    ('nipaweesupachaisakron',     DATE '2024-04-01'),
    ('ophattaerattanachai',       DATE '2024-11-01'),
    ('orapanpougpralub',          DATE '2024-04-01'),
    ('palatthanasrivanichai',     DATE '2024-04-01'),
    ('pariphonjaroonthiravith',   DATE '2024-04-01'),
    ('pemikasiriyotha',           DATE '2024-12-01'),
    ('phannakornkittikool',       DATE '2024-09-01'),
    ('phanuwatpromwong',          DATE '2024-03-01'),
    ('phitarnsakulthanapetch',    DATE '2024-03-01'),
    ('phitarnsakulthanaphetch',   DATE '2024-03-01'),  -- alt spelling
    ('pisitakarapanichayakul',    DATE '2025-12-01'),
    ('ploydpachatararattanapawn', DATE '2024-04-01'),
    ('ploypachatararattanapawn',  DATE '2024-04-01'),  -- alt spelling
    ('pongpatchanthai',           DATE '2025-01-01'),
    ('prakornsirimars',           DATE '2024-12-01'),
    ('praputsomkongsarppaisal',   DATE '2024-04-01'),
    ('praputsornkongsarppaisal',  DATE '2024-04-01'),  -- alt spelling
    ('preedanoita',               DATE '2024-03-01'),
    ('preyawatwatcharachaithanin',DATE '2025-08-01'),
    ('rewatsanpot',               DATE '2024-04-01'),
    ('rewatsanpet',               DATE '2024-04-01'),  -- alt spelling
    ('samritphojan',              DATE '2024-04-01'),
    ('samritpholjan',             DATE '2024-04-01'),  -- alt spelling
    ('sirimonsanoi',              DATE '2026-02-01'),
    ('somramarjvichai',           DATE '2026-06-01'),
    ('sumintraputthakee',         DATE '2026-06-01'),
    ('sunitrabanreuangthong',     DATE '2026-05-01'),
    ('supornwongchompoo',         DATE '2024-06-01'),
    ('tanyalucktreepomwasu',      DATE '2024-04-01'),
    ('tanyalucktreepornwasu',     DATE '2024-04-01'),  -- alt spelling
    ('thanakonintawong',          DATE '2026-06-01'),
    ('thanongSakseriumnuay',      DATE '2024-04-01'),  -- kept for safety
    ('thanongsakseriumnuay',      DATE '2024-04-01'),
    ('thanongsakSeriumnuay',      DATE '2024-04-01'),  -- all-lower variant
    ('thanyalaksamroeloy',        DATE '2024-03-01'),
    ('thanyalaksamreeloy',        DATE '2024-03-01'),  -- alt spelling
    ('theerawutpiyaphinthu',      DATE '2024-04-01'),
    ('thitimahemarak',            DATE '2024-04-01'),
    ('wasawatrattanakompipat',    DATE '2025-01-01'),
    ('wasawatrattanakornpipat',   DATE '2025-01-01'),  -- alt spelling
    ('weerawatsuepadkon',         DATE '2025-06-01'),
    ('wisnugornudomwong',         DATE '2024-03-01'),
    ('wisnugornudornwong',        DATE '2024-03-01'),  -- alt spelling
    ('yositaniyomrat',            DATE '2024-06-01')
)
UPDATE members m
SET membership_start_date = d.start_date
FROM import_data d
WHERE LOWER(REGEXP_REPLACE(m.name,     '[^a-zA-Z0-9]', '', 'g')) = d.norm_name
   OR LOWER(REGEXP_REPLACE(m.nickname, '[^a-zA-Z0-9]', '', 'g')) = d.norm_name;

-- ── Update bni_days in r2y_stats ─────────────────────────────────────
-- Replaces stale value with days-since-chapter-start. Will be refreshed
-- on next Reporting2You CSV import.
UPDATE r2y_stats rs
SET bni_days = GREATEST(1, (CURRENT_DATE - m.membership_start_date)::INT)
FROM members m
WHERE rs.member_id = m.id
  AND m.membership_start_date IS NOT NULL;

-- ── Add unique constraint on renewals.member_id if not exists ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_renewals_member_id' AND conrelid = 'renewals'::regclass
  ) THEN
    -- Deduplicate first: keep only the latest expiry per member
    DELETE FROM renewals r
    USING renewals r2
    WHERE r.member_id = r2.member_id AND r.expiry_date < r2.expiry_date;

    ALTER TABLE renewals ADD CONSTRAINT uq_renewals_member_id UNIQUE (member_id);
  END IF;
END $$;

-- ── Upsert renewals (next annual BNI anniversary after today) ────────
-- Formula: start_date + (years_elapsed + 1) years
-- e.g. Apr-24 today Jun-26 → years_elapsed=2 → expiry Apr-27
INSERT INTO renewals (member_id, expiry_date)
SELECT
  m.id,
  (m.membership_start_date +
    ((EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.membership_start_date))::INT + 1)
     * INTERVAL '1 year'))::DATE  AS expiry_date
FROM members m
WHERE m.membership_start_date IS NOT NULL
  AND m.is_archived = FALSE
ON CONFLICT (member_id) DO UPDATE
  SET expiry_date = EXCLUDED.expiry_date;
