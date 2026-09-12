-- Optional MY121 meeting moment. The matching pair remains the authoritative
-- completion record, so a photo is available whether or not the Guided flow was used.
ALTER TABLE public.matching_pairs
  ADD COLUMN IF NOT EXISTS moment_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS moment_photo_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moment_photo_uploaded_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moment_photo_content_type TEXT;

ALTER TABLE public.matching_pairs
  DROP CONSTRAINT IF EXISTS matching_pairs_moment_photo_path_check;
ALTER TABLE public.matching_pairs
  ADD CONSTRAINT matching_pairs_moment_photo_path_check CHECK (
    moment_photo_path IS NULL OR moment_photo_path ~ '^my121-moments/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('my121-moments', 'my121-moments', false, 1048576, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 1048576,
      allowed_mime_types = ARRAY['image/webp', 'image/jpeg'];

-- No anon/authenticated object policy is created. MY121 validates the linked
-- LINE member and pair membership server-side before issuing signed URLs.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.matching_pairs.moment_photo_path IS
  'Private Supabase Storage path for one optional MY121 meeting photo; never a public URL.';
