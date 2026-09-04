-- Chapter IDEAL uses a 30-second Weekly Presentation.
-- Correct live content seeded by older migrations without rewriting history.

UPDATE public.onboarding_messages
SET message_text = replace(
  replace(message_text, '60-second presentation', '30-second presentation'),
  '60 วินาที',
  '30 วินาที'
)
WHERE message_text ILIKE '%60-second presentation%'
   OR message_text LIKE '%60 วินาที%';

UPDATE public.bni_events
SET note_th = replace(note_th, '60 วินาที', '30 วินาที')
WHERE note_th LIKE '%60 วินาที%';

