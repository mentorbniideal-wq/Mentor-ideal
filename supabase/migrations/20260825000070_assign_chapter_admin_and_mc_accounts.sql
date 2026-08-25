-- Keep the shared Mentor account as MC and assign Pete's personal account as
-- Chapter Admin. Idempotent so re-running the migration is safe.

INSERT INTO public.role_assignments (
  email, role, display_name, team_name, is_mc, is_mentor, is_admin,
  admin_sections, admin_edit_access
) VALUES
  (
    'mentorbniideal@gmail.com', 'mc', 'MC', NULL, true, false, false,
    ARRAY['dashboard','members','issues']::TEXT[], false
  ),
  (
    'phitarn.p@gmail.com', 'admin', 'Chapter Admin', NULL, true, false, true,
    ARRAY['dashboard','members','issues','checkin','revenue','broadcast']::TEXT[], true
  )
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  team_name = EXCLUDED.team_name,
  is_mc = EXCLUDED.is_mc,
  is_mentor = EXCLUDED.is_mentor,
  is_admin = EXCLUDED.is_admin,
  admin_sections = EXCLUDED.admin_sections,
  admin_edit_access = EXCLUDED.admin_edit_access;

