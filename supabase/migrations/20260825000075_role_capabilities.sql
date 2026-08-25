-- Major Upgrade Phase 1: additive capability-based access control.
-- Existing roles and section grants remain intact; this narrows privileged
-- operations without deleting or renaming any account.

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.role_assignments.capabilities IS
  'Explicit capabilities for cross-module operations. Chapter Admin uses *; admin_sections continues to govern Desktop page access.';

UPDATE public.role_assignments
SET capabilities = CASE
  WHEN is_admin = true OR role = 'admin' THEN ARRAY['*']::TEXT[]
  WHEN role = 'mc' THEN ARRAY['mentor.manage','lt.view','signals.view','signals.manage']::TEXT[]
  WHEN role = 'mentor_support' THEN ARRAY['signals.view']::TEXT[]
  WHEN role IN ('toomtam','aof','draft','phai','amp','growth')
    THEN ARRAY['signals.view','signals.manage']::TEXT[]
  ELSE '{}'::TEXT[]
END
WHERE cardinality(capabilities) = 0;

-- Pin the two operational accounts to their intended boundaries.
UPDATE public.role_assignments
SET capabilities = ARRAY['*']::TEXT[]
WHERE lower(email) = 'phitarn.p@gmail.com';

UPDATE public.role_assignments
SET capabilities = ARRAY['mentor.manage','lt.view','signals.view','signals.manage']::TEXT[],
    admin_edit_access = false
WHERE lower(email) = 'mentorbniideal@gmail.com';
