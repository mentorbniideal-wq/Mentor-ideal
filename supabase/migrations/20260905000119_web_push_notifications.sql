-- Reliable, tenant-ready Web Push foundation for the mobile operations app.
-- Additive only: existing in-app notifications and LINE delivery remain unchanged.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_chapter_dedupe
  ON public.notifications(chapter_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_chapter_created
  ON public.notifications(chapter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE CASCADE,
  recipient_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  user_agent TEXT,
  platform TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, endpoint_hash)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_recipient
  ON public.web_push_subscriptions(chapter_id, recipient_key, status);

CREATE TABLE IF NOT EXISTS public.web_push_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead_letter','paused')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(notification_id)
);

CREATE INDEX IF NOT EXISTS idx_web_push_jobs_ready
  ON public.web_push_jobs(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS public.web_push_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.web_push_subscriptions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('accepted','temporary_failure','permanent_failure')),
  provider_status INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, subscription_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_web_push_delivery_notification
  ON public.web_push_delivery_attempts(notification_id, created_at DESC);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions, public.web_push_jobs,
  public.web_push_delivery_attempts FROM anon, authenticated;
GRANT ALL ON public.web_push_subscriptions, public.web_push_jobs,
  public.web_push_delivery_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_web_push_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at > now() THEN
    INSERT INTO public.web_push_jobs(notification_id, chapter_id)
    VALUES (NEW.id, NEW.chapter_id)
    ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_web_push_notification ON public.notifications;
CREATE TRIGGER trg_enqueue_web_push_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enqueue_web_push_notification();

COMMENT ON TABLE public.web_push_subscriptions IS
  'Service-only browser push endpoints. Chapter and recipient scope are derived by the API.';
COMMENT ON TABLE public.web_push_delivery_attempts IS
  'Provider-acceptance ledger; accepted does not claim that an OS displayed the notification.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regprocedure('public.call_cron_job(text)') IS NOT NULL THEN
    BEGIN PERFORM cron.unschedule('web-push-dispatch'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('web-push-dispatch', '* * * * *',
      $job$SELECT public.call_cron_job('webPushDispatch');$job$);
  END IF;
END;
$$;
