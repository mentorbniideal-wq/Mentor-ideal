-- Google OAuth email → BNI IDEAL role mapping
-- Replaces PIN-based login. Only readable via service_role (no anon policies).
CREATE TABLE IF NOT EXISTS role_assignments (
  email        text PRIMARY KEY,
  role         text NOT NULL CHECK (role IN ('mc','toomtam','aof','draft','phai','amp','growth')),
  display_name text NOT NULL DEFAULT '',
  team_name    text,
  is_mc        boolean NOT NULL DEFAULT false,
  is_mentor    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
-- No public policies — only service_role can query this table.

-- ── Seed with your Google email addresses ──────────────────────
-- Run these INSERT statements after enabling Google OAuth in Supabase Dashboard:
--
-- INSERT INTO role_assignments (email, role, display_name, team_name, is_mc, is_mentor) VALUES
--   ('mc@yourdomain.com',       'mc',      'MC',      null,      true,  false),
--   ('toomtam@yourdomain.com',  'toomtam', 'TOOMTAM', 'TOOMTAM', false, true ),
--   ('aof@yourdomain.com',      'aof',     'Aof',     'Aof',     false, true ),
--   ('draft@yourdomain.com',    'draft',   'Draft',   'Draft',   false, true ),
--   ('phai@yourdomain.com',     'phai',    'PHAI',    'PHAI',    false, true ),
--   ('amp@yourdomain.com',      'amp',     'AMP',     'AMP',     false, true ),
--   ('growth@yourdomain.com',   'growth',  'Growth',  null,      false, false)
-- ON CONFLICT (email) DO UPDATE SET
--   role=EXCLUDED.role, display_name=EXCLUDED.display_name,
--   team_name=EXCLUDED.team_name, is_mc=EXCLUDED.is_mc, is_mentor=EXCLUDED.is_mentor;
