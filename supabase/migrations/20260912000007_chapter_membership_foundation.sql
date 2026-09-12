-- Phase 2A: tenant membership foundation.
-- chapter_profiles remains the existing canonical Chapter catalog; this avoids
-- rewriting already-deployed foreign keys before the Phase 2B data backfill.

CREATE TABLE IF NOT EXISTS public.chapter_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  platform_role TEXT NOT NULL DEFAULT 'chapter_user' CHECK (platform_role IN ('platform_admin','chapter_admin','chapter_user')),
  access_status TEXT NOT NULL DEFAULT 'active' CHECK (access_status IN ('active','suspended','revoked')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'phase_2a_backfill',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_memberships_default_email
  ON public.chapter_memberships(lower(email)) WHERE is_default AND access_status = 'active';
CREATE INDEX IF NOT EXISTS idx_chapter_memberships_email_active
  ON public.chapter_memberships(lower(email), access_status);
CREATE INDEX IF NOT EXISTS idx_chapter_memberships_chapter_active
  ON public.chapter_memberships(chapter_id, access_status);

ALTER TABLE public.chapter_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chapter_memberships FROM anon, authenticated;

-- Backfill only the current installation's active Chapter. This is idempotent
-- and intentionally does not infer a second tenant or move any member data.
INSERT INTO public.chapter_memberships(
  chapter_id, email, member_id, platform_role, access_status, is_default, source
)
SELECT
  chapter.id,
  lower(btrim(ra.email)),
  ra.member_id,
  CASE WHEN COALESCE(ra.is_admin, false) THEN 'chapter_admin' ELSE 'chapter_user' END,
  CASE WHEN COALESCE(ra.access_status, 'active') IN ('active','suspended','revoked') THEN COALESCE(ra.access_status, 'active') ELSE 'active' END,
  true,
  'phase_2a_role_assignment_backfill'
FROM public.role_assignments ra
JOIN public.chapter_profiles chapter ON chapter.chapter_key = 'bni-ideal'
WHERE btrim(COALESCE(ra.email, '')) <> ''
ON CONFLICT (chapter_id, email) DO UPDATE SET
  member_id = EXCLUDED.member_id,
  platform_role = EXCLUDED.platform_role,
  access_status = EXCLUDED.access_status,
  is_default = EXCLUDED.is_default,
  updated_at = now();

COMMENT ON TABLE public.chapter_memberships IS
  'Phase 2A tenant membership source. API scope must be derived from this table, never from a client-supplied chapter_id.';
COMMENT ON COLUMN public.chapter_profiles.id IS
  'Canonical Chapter stable ID used by Phase 2A memberships and Phase 2B tenant-scoped records.';
