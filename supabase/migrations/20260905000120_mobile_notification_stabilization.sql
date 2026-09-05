-- Mobile notification stabilization. Additive and backward compatible.

ALTER TABLE public.web_push_subscriptions
  ADD COLUMN IF NOT EXISTS recipient_keys TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.web_push_subscriptions
SET recipient_keys = ARRAY[recipient_key]
WHERE cardinality(recipient_keys) = 0;

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_recipient_keys
  ON public.web_push_subscriptions USING gin(recipient_keys);

-- Existing single-Chapter rows receive a tenant scope. In a multi-Chapter
-- installation an ambiguous NULL stays NULL and must be resolved explicitly.
WITH only_chapter AS (
  SELECT min(id::text)::uuid AS id FROM public.chapter_profiles
  WHERE is_active = true HAVING count(*) = 1
)
UPDATE public.notifications n SET chapter_id = c.id
FROM only_chapter c WHERE n.chapter_id IS NULL;

CREATE OR REPLACE FUNCTION public.assign_notification_chapter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_chapter_id UUID;
BEGIN
  IF NEW.chapter_id IS NULL THEN
    SELECT min(id::text)::uuid INTO v_chapter_id FROM public.chapter_profiles
    WHERE is_active = true HAVING count(*) = 1;
    NEW.chapter_id := v_chapter_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_notification_chapter ON public.notifications;
CREATE TRIGGER trg_assign_notification_chapter
BEFORE INSERT ON public.notifications FOR EACH ROW
EXECUTE FUNCTION public.assign_notification_chapter();

CREATE OR REPLACE FUNCTION public.purge_mobile_operational_history()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_runs INTEGER; v_attempts INTEGER; v_jobs INTEGER; v_subscriptions INTEGER;
BEGIN
  DELETE FROM public.system_job_runs WHERE created_at < now() - interval '90 days'; GET DIAGNOSTICS v_runs = ROW_COUNT;
  DELETE FROM public.web_push_delivery_attempts WHERE created_at < now() - interval '90 days'; GET DIAGNOSTICS v_attempts = ROW_COUNT;
  DELETE FROM public.web_push_jobs WHERE status IN ('completed','dead_letter') AND created_at < now() - interval '30 days'; GET DIAGNOSTICS v_jobs = ROW_COUNT;
  DELETE FROM public.web_push_subscriptions WHERE status IN ('revoked','expired') AND updated_at < now() - interval '30 days'; GET DIAGNOSTICS v_subscriptions = ROW_COUNT;
  RETURN jsonb_build_object('jobRuns',v_runs,'deliveryAttempts',v_attempts,'pushJobs',v_jobs,'subscriptions',v_subscriptions);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_mobile_operational_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_mobile_operational_history() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('mobile-operational-retention'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('mobile-operational-retention', '17 3 * * *',
      $job$SELECT public.purge_mobile_operational_history();$job$);
  END IF;
END;
$$;

COMMENT ON COLUMN public.web_push_subscriptions.recipient_keys IS
  'Server-derived recipients registered on this browser endpoint; supports safe role changes on one device.';
