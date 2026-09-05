-- Commercial-ready Chapter configuration foundation.
-- LINE credentials remain in Edge Function secrets and are intentionally out of scope.

CREATE TABLE IF NOT EXISTS public.chapter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_key TEXT NOT NULL UNIQUE CHECK (chapter_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  short_name TEXT NOT NULL CHECK (char_length(btrim(short_name)) BETWEEN 2 AND 40),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  locale TEXT NOT NULL DEFAULT 'th-TH',
  meeting_weekday SMALLINT NOT NULL DEFAULT 5 CHECK (meeting_weekday BETWEEN 0 AND 6),
  meeting_time TIME NOT NULL DEFAULT '06:30',
  presentation_seconds SMALLINT NOT NULL DEFAULT 30 CHECK (presentation_seconds BETWEEN 15 AND 120),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(branding) = 'object'),
  scoring_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scoring_config) = 'object'),
  notification_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notification_config) = 'object'),
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chapter_profile_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE CASCADE,
  config_version INTEGER NOT NULL CHECK (config_version > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  changed_by TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, config_version)
);

CREATE INDEX IF NOT EXISTS idx_chapter_profile_revisions_recent
  ON public.chapter_profile_revisions(chapter_id, config_version DESC);

ALTER TABLE public.chapter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_profile_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chapter_profiles, public.chapter_profile_revisions FROM anon, authenticated;

INSERT INTO public.chapter_profiles(
  chapter_key, display_name, short_name, timezone, locale,
  meeting_weekday, meeting_time, presentation_seconds, branding,
  scoring_config, notification_config, is_active
) VALUES (
  'bni-ideal', 'BNI IDEAL', 'IDEAL', 'Asia/Bangkok', 'th-TH',
  5, '06:30', 30,
  '{"primaryColor":"#0f4c43","accentColor":"#d2b779"}'::jsonb,
  '{"trafficLight":{"green":70,"yellow":50,"red":30}}'::jsonb,
  '{"quietHoursStart":"20:00","quietHoursEnd":"08:00","dailyMemberCap":1}'::jsonb,
  true
) ON CONFLICT (chapter_key) DO NOTHING;

INSERT INTO public.chapter_profile_revisions(chapter_id, config_version, snapshot, changed_by, change_reason)
SELECT p.id, p.config_version, to_jsonb(p) - 'created_at' - 'updated_at',
       'system', 'Initial commercial-ready Chapter configuration'
FROM public.chapter_profiles p
WHERE p.chapter_key = 'bni-ideal'
ON CONFLICT (chapter_id, config_version) DO NOTHING;

INSERT INTO public.settings(key, value) VALUES
  ('ACTIVE_CHAPTER_KEY', 'bni-ideal'),
  ('CHAPTER_DISPLAY_NAME', 'BNI IDEAL'),
  ('CHAPTER_TIMEZONE', 'Asia/Bangkok'),
  ('CHAPTER_MEETING_WEEKDAY', '5'),
  ('CHAPTER_MEETING_TIME', '06:30'),
  ('PRESENTATION_SECONDS', '30')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.chapter_profiles IS
  'Non-secret, versioned Chapter configuration. Tenant credentials never belong in this table.';
COMMENT ON TABLE public.chapter_profile_revisions IS
  'Immutable snapshots used for configuration audit and safe restoration.';
