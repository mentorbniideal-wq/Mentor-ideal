-- Preserve stable team codes for joins/history while using the configurable
-- display name consistently in PIN and Google-authenticated sessions.
CREATE OR REPLACE FUNCTION public.sync_mentor_team_display_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_display TEXT;
BEGIN
  v_role := CASE NEW.name
    WHEN 'TOOMTAM' THEN 'toomtam'
    WHEN 'Aof' THEN 'aof'
    WHEN 'Draft' THEN 'draft'
    WHEN 'PHAI' THEN 'phai'
    WHEN 'AMP' THEN 'amp'
    ELSE NULL
  END;
  v_display := COALESCE(NULLIF(btrim(NEW.display_name), ''), NULLIF(btrim(NEW.leader_name), ''), NEW.name);
  v_display := regexp_replace(v_display, '^ทีม[[:space:]]+', '', 'i');

  IF v_role IS NOT NULL THEN
    UPDATE public.roles
    SET display_name = v_display, team_name = NEW.name, updated_at = now()
    WHERE role = v_role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mentor_team_display_identity() FROM PUBLIC, anon, authenticated;

UPDATE public.roles AS r
SET display_name = regexp_replace(
      COALESCE(NULLIF(btrim(mt.display_name), ''), NULLIF(btrim(mt.leader_name), ''), mt.name),
      '^ทีม[[:space:]]+', '', 'i'
    ),
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
  'Syncs configurable Mentor Team display identity into legacy PIN roles without renaming stable team codes.';
