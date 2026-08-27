-- Present Mentor staffing as eight human positions. The five durable team
-- codes remain unchanged so historical membership and reports keep working.
UPDATE public.passport_lt_assignments
SET lt_role = 'Mentor Support 1', updated_at = now()
WHERE lt_role = 'Mentor Support';

UPDATE public.passport_sessions
SET lt_role = 'Mentor Support 1', updated_at = now()
WHERE lt_role = 'Mentor Support';

COMMENT ON COLUMN public.mentor_teams.name IS
  'Durable hidden compatibility key. User interfaces must display the assigned Mentor name, never this value.';
