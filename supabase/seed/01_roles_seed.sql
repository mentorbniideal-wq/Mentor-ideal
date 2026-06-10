-- ============================================================
-- Seed: roles PIN update
-- Run AFTER migrations. Replace each 'REAL_PIN_HERE' with the actual PIN.
-- Do NOT commit this file with real PINs in version control.
-- ============================================================

-- ⚠️  SECURITY: update pins before first deploy, then delete this file from git
-- ⚠️  NEVER push real PINs to GitHub

UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'mc';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'toomtam';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'aof';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'draft';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'phai';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'amp';
UPDATE roles SET pin_hash = crypt('REAL_PIN_HERE', gen_salt('bf', 10)) WHERE role = 'growth';

-- Verify (should show all 7 roles with non-empty pin_hash):
-- SELECT role, display_name, team_name, is_mc, is_mentor FROM roles ORDER BY role;

-- ============================================================
-- Seed: fn_update_pin helper (add after migration 001)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_pin(p_role TEXT, p_new_pin TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE roles
  SET    pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
         updated_at = now()
  WHERE  role = p_role;
$$;
