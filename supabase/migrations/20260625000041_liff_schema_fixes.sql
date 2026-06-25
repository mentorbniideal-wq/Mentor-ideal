-- Migration 041: Fix LIFF schema bugs
-- 1. Add partner_name to one_to_one_logs (liff-api inserts this column but it was missing)
ALTER TABLE one_to_one_logs ADD COLUMN IF NOT EXISTS partner_name TEXT;

-- 2. Fix mentor_teams.leader_name for Aof — resolveLineRole normalizes names and compares;
--    'Aof' (English) doesn't match Adisak's name/nickname ('อ็อฟ' Thai).
--    Use 'Adisak' so normalizePersonName('Adisak') = 'adisak' which is included in
--    normalizePersonName('Adisak Pankhot') = 'adisakpankhot'.
UPDATE mentor_teams SET leader_name = 'Adisak' WHERE name = 'Aof';
