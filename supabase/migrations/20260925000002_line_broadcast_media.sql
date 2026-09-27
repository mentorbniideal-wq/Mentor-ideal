-- Private media for human-confirmed LT M2M and Chapter-admin broadcasts.
-- Delivery APIs issue short-lived URLs only after server-side authorization.
-- No storage.objects policy is needed because browser uploads use signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'line-broadcast-media',
  'line-broadcast-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
