-- Smart Chapter Directory Phase 1: member-owned bookmarks, privacy-safe usage
-- events, and an explicit rollout review state. Additive and reversible.

CREATE TABLE public.chapter_directory_bookmarks (
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  subject_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, subject_member_id),
  CHECK (member_id <> subject_member_id)
);

CREATE INDEX idx_chapter_directory_bookmarks_member_created
  ON public.chapter_directory_bookmarks(member_id, created_at DESC);

-- Deliberately omits actor/member identity and raw query text. This table is
-- suitable for aggregate product health only, never individual surveillance.
CREATE TABLE public.chapter_directory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('search','result_open','bookmark_added','bookmark_removed')),
  subject_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  result_count INTEGER CHECK (result_count IS NULL OR result_count BETWEEN 0 AND 300),
  has_query BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chapter_directory_events_type_created
  ON public.chapter_directory_events(event_type, created_at DESC);

ALTER TABLE public.chapter_directory_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_directory_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chapter_directory_bookmarks, public.chapter_directory_events FROM anon, authenticated;

COMMENT ON TABLE public.chapter_directory_bookmarks IS
  'Member-owned saved Chapter members; accessed only through the identity-checked LIFF API.';
COMMENT ON TABLE public.chapter_directory_events IS
  'Aggregate-only Directory product events. Actor identity and raw search query are intentionally not stored.';

INSERT INTO public.settings(key,value) VALUES
  ('CHAPTER_DIRECTORY_PHASE','1'),
  ('CHAPTER_DIRECTORY_PHASE_STATUS','in_progress'),
  ('CHAPTER_DIRECTORY_REVIEW_DATE','2026-09-07'),
  ('CHAPTER_DIRECTORY_REVIEW_DECISION','pending')
ON CONFLICT (key) DO NOTHING;

