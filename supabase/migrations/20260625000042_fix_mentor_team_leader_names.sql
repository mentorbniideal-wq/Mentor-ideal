-- Migration 042: Fix mentor_teams.leader_name to match actual member first names
--
-- The LIFF (liff-api bootstrap) and webhook (replyTeam/replyFocus3) both resolve
-- a mentor's team by querying:
--   leader_name.ilike.%{memberName}% OR leader_name.ilike.%{nickname}%
--
-- The old values (Toomtam/Draft/PHAI/AMP) are English team aliases that match
-- neither the member's English name nor Thai nickname.
-- Use the English first name so normalizePersonName(memberName).includes(leader) = true.

UPDATE mentor_teams SET leader_name = 'Phitarn' WHERE name = 'TOOMTAM';
UPDATE mentor_teams SET leader_name = 'Samrit'  WHERE name = 'Draft';
UPDATE mentor_teams SET leader_name = 'Prakorn' WHERE name = 'PHAI';
UPDATE mentor_teams SET leader_name = 'Rewat'   WHERE name = 'AMP';
-- Aof: already fixed to 'Adisak' in migration 041
