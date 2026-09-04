-- Read-only external viewer. Its initial PIN is random and unknowable; the
-- system owner must set a numeric PIN before sharing access.

INSERT INTO public.roles(role, pin_hash, display_name, team_name, is_mc, is_mentor)
VALUES ('viewer', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), 'Viewer · Read only', NULL, true, false)
ON CONFLICT (role) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  team_name = NULL,
  is_mc = true,
  is_mentor = false,
  updated_at = now();

COMMENT ON TABLE public.roles IS
  'PIN roles. viewer is authorized only for read actions by the Edge Function, regardless of is_mc.';
