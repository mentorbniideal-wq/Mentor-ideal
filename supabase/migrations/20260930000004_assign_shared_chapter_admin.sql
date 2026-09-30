-- Promote the existing shared Mentor mailbox to Chapter Admin only.
-- The verified personal System Owner identity remains a separate application role.
UPDATE public.role_assignments
SET role = 'admin', display_name = 'Chapter Admin', team_name = NULL,
    is_mc = true, is_mentor = false, is_admin = true,
    admin_sections = ARRAY['dashboard','members','issues','checkin','revenue','broadcast']::text[],
    admin_edit_access = true
WHERE lower(btrim(email)) = 'mentorbniideal@gmail.com'
  AND COALESCE(access_status, 'active') = 'active';

UPDATE public.chapter_memberships cm
SET platform_role = 'chapter_admin', updated_at = now()
FROM public.chapter_profiles cp
WHERE cm.chapter_id = cp.id AND cp.chapter_key = 'bni-ideal'
  AND lower(btrim(cm.email)) = 'mentorbniideal@gmail.com'
  AND cm.access_status = 'active';
