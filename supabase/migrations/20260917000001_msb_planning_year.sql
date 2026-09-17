-- The Blueprint intake year is Chapter configuration, not the server calendar
-- year. This lets a Chapter open next year's planning cycle before New Year
-- without changing or invalidating historical Blueprint links.
ALTER TABLE public.chapter_profiles
  ADD COLUMN IF NOT EXISTS msb_planning_year INTEGER
  CHECK (msb_planning_year BETWEEN 2020 AND 2100);

UPDATE public.chapter_profiles
SET msb_planning_year = 2027,
    updated_at = now()
WHERE chapter_key = 'bni-ideal'
  AND msb_planning_year IS DISTINCT FROM 2027;

COMMENT ON COLUMN public.chapter_profiles.msb_planning_year IS
  'Default annual Member Success Blueprint intake year for this Chapter.';

INSERT INTO public.chapter_profile_revisions(
  chapter_id, config_version, snapshot, changed_by, change_reason
)
SELECT p.id, p.config_version + 1,
       to_jsonb(p) - 'created_at' - 'updated_at' || jsonb_build_object('config_version', p.config_version + 1),
       'system', 'Set active Member Success Blueprint planning year'
FROM public.chapter_profiles p
WHERE p.chapter_key = 'bni-ideal'
ON CONFLICT (chapter_id, config_version) DO NOTHING;

UPDATE public.chapter_profiles
SET config_version = config_version + 1,
    updated_at = now()
WHERE chapter_key = 'bni-ideal';
