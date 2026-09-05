-- 30 seconds is a copy correction for the Friday meeting reminder only.
-- It is not a Chapter-wide business rule or scoring configuration.

DELETE FROM public.settings WHERE key = 'PRESENTATION_SECONDS';

COMMENT ON COLUMN public.chapter_profiles.presentation_seconds IS
  'Deprecated compatibility field from migration 112. Do not use as a Chapter rule; presentation wording belongs to the relevant LINE template.';

UPDATE public.line_automation_controls
SET custom_message = replace(
      replace(custom_message, '60-second presentation', '30-second presentation'),
      '60 วินาที',
      '30 วินาที'
    ),
    updated_at = now(),
    updated_by = 'system:scope-30-seconds-to-line-copy'
WHERE automation_key = 'wednesdayNudge'
  AND custom_message IS NOT NULL
  AND (
    custom_message ILIKE '%60-second presentation%'
    OR custom_message LIKE '%60 วินาที%'
  );

INSERT INTO public.chapter_audit_events(
  event_type, actor_role, actor_ref, subject_type, subject_ref, metadata
) VALUES (
  'line_copy_correction_applied', 'system', 'migration:20260905000113',
  'line_automation', 'wednesdayNudge',
  '{"correction":"60-second presentation → 30-second presentation","scope":"line_copy_only"}'::jsonb
);
