-- Repair Mobile access assignments created after the initial tenant backfill.
-- The Chapter is derived from the linked member; no browser-provided scope is used.

UPDATE public.role_assignments AS assignment
SET chapter_id = member.chapter_id,
    updated_at = now()
FROM public.members AS member
WHERE assignment.member_id = member.id
  AND assignment.chapter_id IS NULL
  AND member.chapter_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.role_assignments AS assignment
    JOIN public.members AS member ON member.id = assignment.member_id
    WHERE assignment.chapter_id IS DISTINCT FROM member.chapter_id
  ) THEN
    RAISE EXCEPTION 'Role assignment Chapter does not match its linked member';
  END IF;
END $$;
