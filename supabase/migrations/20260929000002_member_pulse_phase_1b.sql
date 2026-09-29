-- Phase 1B: human-reviewed Pulse delivery, opaque member access tokens,
-- bounded reminders, and forward-compatible response visibility.
ALTER TABLE public.member_pulse_policies
  ALTER COLUMN cooldown_days SET DEFAULT 60,
  ALTER COLUMN renewal_days_before SET DEFAULT 90,
  ALTER COLUMN due_soon_days SET DEFAULT 7,
  ALTER COLUMN milestones SET DEFAULT '[{"stage":"onboarding","months":3},{"stage":"activation","months":6},{"stage":"experience","months":12,"repeatMonths":6}]'::jsonb;
-- Phase 1B is not enabled by migration. Normalize dormant policy rows to the
-- approved cadence, and require a later authorized enablement decision.
UPDATE public.member_pulse_policies
  SET milestones = '[{"stage":"onboarding","months":3},{"stage":"activation","months":6},{"stage":"experience","months":12,"repeatMonths":6}]'::jsonb,
      renewal_days_before = 90, due_soon_days = 7, cooldown_days = 60, enabled = false,
      updated_at = now();

ALTER TABLE public.member_pulse_templates
  ADD COLUMN visibility_scope TEXT NOT NULL DEFAULT 'member'
    CHECK (visibility_scope IN ('member','mentor_growth','leadership_only'));

ALTER TABLE public.member_pulse_campaigns
  ADD COLUMN reminders_sent SMALLINT NOT NULL DEFAULT 0 CHECK (reminders_sent BETWEEN 0 AND 2),
  ADD COLUMN last_reminded_at TIMESTAMPTZ,
  ADD COLUMN sent_by_email TEXT;

CREATE TABLE public.member_pulse_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  FOREIGN KEY (campaign_id, chapter_id)
    REFERENCES public.member_pulse_campaigns(id, chapter_id) ON DELETE RESTRICT
);
CREATE INDEX member_pulse_tokens_active_lookup
  ON public.member_pulse_tokens(token_hash, expires_at) WHERE revoked_at IS NULL;
ALTER TABLE public.member_pulse_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_pulse_tokens FROM anon, authenticated;
COMMENT ON COLUMN public.member_pulse_templates.visibility_scope IS
  'Future-safe response visibility boundary; API still enforces viewer scope server-side.';
COMMENT ON TABLE public.member_pulse_tokens IS
  'Hashed opaque links for a single Pulse campaign; raw token is returned once and never stored.';

CREATE FUNCTION public.guard_member_pulse_response_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE campaign_member UUID; campaign_status TEXT;
BEGIN
  SELECT member_id, status INTO campaign_member, campaign_status
    FROM public.member_pulse_campaigns
    WHERE id = NEW.campaign_id AND chapter_id = NEW.chapter_id;
  IF campaign_member IS NULL THEN RAISE EXCEPTION 'Pulse response campaign scope mismatch'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL AND NEW.answers IS DISTINCT FROM OLD.answers THEN
    RAISE EXCEPTION 'Completed Pulse response is immutable';
  END IF;
  IF campaign_status IN ('completed','expired','declined','superseded') AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'Pulse campaign is closed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_pulse_response_update
  BEFORE INSERT OR UPDATE ON public.member_pulse_responses
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_pulse_response_update();

CREATE FUNCTION public.guard_member_pulse_visibility_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.visibility_scope IS DISTINCT FROM OLD.visibility_scope THEN
    RAISE EXCEPTION 'Pulse template response visibility is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_pulse_visibility_scope
  BEFORE UPDATE ON public.member_pulse_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_pulse_visibility_scope();

CREATE FUNCTION public.audit_member_pulse_reminder() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.reminders_sent IS DISTINCT FROM OLD.reminders_sent THEN
    INSERT INTO public.chapter_audit_events(event_type, subject_type, subject_ref, metadata)
    VALUES ('member_pulse_reminder_sent', 'member_pulse_campaign', NEW.id::text,
      jsonb_build_object('chapter_id', NEW.chapter_id, 'reminders_sent', NEW.reminders_sent));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_member_pulse_reminder
  AFTER UPDATE OF reminders_sent ON public.member_pulse_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_pulse_reminder();
