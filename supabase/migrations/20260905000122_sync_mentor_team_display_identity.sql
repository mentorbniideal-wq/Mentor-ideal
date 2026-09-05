-- Keep the stable Mentor Team code for joins/history, while synchronising the
-- current leader name used by legacy PIN authentication and user-facing copy.

CREATE OR REPLACE FUNCTION public.sync_mentor_team_display_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := CASE NEW.name
    WHEN 'TOOMTAM' THEN 'toomtam'
    WHEN 'Aof' THEN 'aof'
    WHEN 'Draft' THEN 'draft'
    WHEN 'PHAI' THEN 'phai'
    WHEN 'AMP' THEN 'amp'
    ELSE NULL
  END;

  IF v_role IS NOT NULL THEN
    UPDATE public.roles
    SET display_name = COALESCE(NULLIF(btrim(NEW.leader_name), ''), NEW.name),
        team_name = NEW.name,
        updated_at = now()
    WHERE role = v_role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mentor_team_display_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_mentor_team_display_identity ON public.mentor_teams;
CREATE TRIGGER trg_sync_mentor_team_display_identity
AFTER INSERT OR UPDATE OF leader_name, display_name, leader_member_id
ON public.mentor_teams
FOR EACH ROW
EXECUTE FUNCTION public.sync_mentor_team_display_identity();

-- Backfill current terms, including the AMP stable team code now led by Tik.
UPDATE public.roles AS r
SET display_name = COALESCE(NULLIF(btrim(mt.leader_name), ''), mt.name),
    team_name = mt.name,
    updated_at = now()
FROM public.mentor_teams AS mt
WHERE r.role = CASE mt.name
  WHEN 'TOOMTAM' THEN 'toomtam'
  WHEN 'Aof' THEN 'aof'
  WHEN 'Draft' THEN 'draft'
  WHEN 'PHAI' THEN 'phai'
  WHEN 'AMP' THEN 'amp'
  ELSE NULL
END;

COMMENT ON FUNCTION public.sync_mentor_team_display_identity() IS
  'Synchronises the current Mentor leader into legacy PIN role display data without renaming the stable team code.';
