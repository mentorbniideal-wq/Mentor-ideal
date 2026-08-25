-- Mentor Support is a cross-team internal support role.
-- It may review and update internal care notes, but direct member communication
-- remains restricted in the API to Mentor Co. and each team's primary Mentor.

ALTER TABLE public.role_assignments
  DROP CONSTRAINT IF EXISTS role_assignments_role_check;

ALTER TABLE public.role_assignments
  ADD CONSTRAINT role_assignments_role_check
  CHECK (role IN ('admin','mc','toomtam','aof','draft','phai','amp','mentor_support','growth'));

COMMENT ON COLUMN public.role_assignments.role IS
  'Operational access role. mentor_support has cross-team read/internal-care access without direct member messaging.';

