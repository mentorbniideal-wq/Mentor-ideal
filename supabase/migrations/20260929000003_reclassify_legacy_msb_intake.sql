-- The early 2026 member MSB form was the 2027 planning intake. Historical
-- 2026 Growth targets are separate rows in member_annual_growth_goals.
-- Keep both submitted answers when a member submitted twice: the later 2027
-- submission remains canonical and the older row is retained as provenance.
-- This migration is idempotent and never changes member-authored field values.

UPDATE public.member_success_blueprints AS legacy
SET blueprint_year = 2027,
    source = 'member_form_2026_reclassified'
WHERE legacy.blueprint_year = 2026
  AND legacy.source = 'member_form'
  AND EXISTS (
    SELECT 1 FROM public.members AS member
    JOIN public.chapter_profiles AS chapter ON chapter.id = member.chapter_id
    WHERE member.id = legacy.member_id AND chapter.chapter_key = 'bni-ideal'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.member_success_blueprints AS current_form
    WHERE current_form.member_id = legacy.member_id
      AND current_form.blueprint_year = 2027
  );

UPDATE public.member_success_blueprints AS legacy
SET source = 'member_form_2026_superseded'
WHERE legacy.blueprint_year = 2026
  AND legacy.source = 'member_form'
  AND EXISTS (
    SELECT 1 FROM public.members AS member
    JOIN public.chapter_profiles AS chapter ON chapter.id = member.chapter_id
    WHERE member.id = legacy.member_id AND chapter.chapter_key = 'bni-ideal'
  )
  AND EXISTS (
    SELECT 1 FROM public.member_success_blueprints AS current_form
    WHERE current_form.member_id = legacy.member_id
      AND current_form.blueprint_year = 2027
  );
