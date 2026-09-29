-- Member Pulse Phase 1A: dormant, Chapter-scoped persistence only.
-- No policy or template is seeded, no member records are copied, and no LINE
-- delivery or scheduler is activated by this migration.

CREATE TABLE public.member_pulse_policies (
  chapter_id UUID PRIMARY KEY REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(milestones) = 'array'),
  renewal_days_before INTEGER NOT NULL CHECK (renewal_days_before BETWEEN 1 AND 365),
  due_soon_days INTEGER NOT NULL CHECK (due_soon_days BETWEEN 0 AND 90),
  cooldown_days INTEGER NOT NULL CHECK (cooldown_days BETWEEN 0 AND 365),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.member_pulse_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('onboarding','activation','value_retention','experience','renewal')),
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  question_spec JSONB NOT NULL CHECK (jsonb_typeof(question_spec) = 'array'),
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, stage, version),
  UNIQUE (id, chapter_id, stage)
);
CREATE UNIQUE INDEX member_pulse_one_active_template_per_stage
  ON public.member_pulse_templates(chapter_id, stage) WHERE active;

CREATE TABLE public.member_pulse_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('onboarding','activation','value_retention','experience','renewal')),
  cycle_key TEXT NOT NULL CHECK (char_length(cycle_key) BETWEEN 5 AND 100),
  due_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','sent','opened','in_progress','completed','declined','expired')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, member_id, cycle_key),
  UNIQUE (id, chapter_id),
  FOREIGN KEY (template_id, chapter_id, stage)
    REFERENCES public.member_pulse_templates(id, chapter_id, stage) ON DELETE RESTRICT
);
CREATE INDEX member_pulse_campaigns_queue
  ON public.member_pulse_campaigns(chapter_id, status, due_on);
CREATE INDEX member_pulse_campaigns_member_history
  ON public.member_pulse_campaigns(chapter_id, member_id, created_at DESC);

CREATE TABLE public.member_pulse_responses (
  campaign_id UUID PRIMARY KEY,
  chapter_id UUID NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (campaign_id, chapter_id)
    REFERENCES public.member_pulse_campaigns(id, chapter_id) ON DELETE RESTRICT
);

CREATE FUNCTION public.guard_member_pulse_campaign() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE member_chapter UUID;
BEGIN
  SELECT chapter_id INTO member_chapter FROM public.members WHERE id = NEW.member_id;
  IF member_chapter IS DISTINCT FROM NEW.chapter_id THEN
    RAISE EXCEPTION 'Pulse campaign member Chapter mismatch';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.chapter_id IS DISTINCT FROM OLD.chapter_id OR
    NEW.member_id IS DISTINCT FROM OLD.member_id OR
    NEW.template_id IS DISTINCT FROM OLD.template_id OR
    NEW.stage IS DISTINCT FROM OLD.stage OR
    NEW.cycle_key IS DISTINCT FROM OLD.cycle_key OR
    NEW.due_on IS DISTINCT FROM OLD.due_on
  ) THEN RAISE EXCEPTION 'Pulse campaign identity is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_pulse_campaign
  BEFORE INSERT OR UPDATE ON public.member_pulse_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_pulse_campaign();

CREATE FUNCTION public.guard_member_pulse_template() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Pulse template versions are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND (
      NEW.chapter_id IS DISTINCT FROM OLD.chapter_id OR
      NEW.stage IS DISTINCT FROM OLD.stage OR
      NEW.version IS DISTINCT FROM OLD.version OR
      NEW.title IS DISTINCT FROM OLD.title OR
      NEW.question_spec IS DISTINCT FROM OLD.question_spec
  ) THEN RAISE EXCEPTION 'Pulse template versions are immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_pulse_template
  BEFORE UPDATE OR DELETE ON public.member_pulse_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_pulse_template();

-- Audit only metadata; survey answers and free text never enter audit logs.
CREATE FUNCTION public.audit_member_pulse_metadata() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE audit_subject TEXT; audit_metadata JSONB; audit_event TEXT;
BEGIN
  IF TG_TABLE_NAME = 'member_pulse_responses' THEN
    audit_subject := NEW.campaign_id::text;
    audit_metadata := jsonb_build_object('chapter_id', NEW.chapter_id, 'completed', NEW.completed_at IS NOT NULL);
    audit_event := 'member_pulse_response_saved';
  ELSE
    audit_subject := NEW.id::text;
    audit_metadata := jsonb_build_object('chapter_id', NEW.chapter_id, 'stage', NEW.stage, 'status', NEW.status);
    audit_event := CASE WHEN TG_OP = 'INSERT' THEN 'member_pulse_campaign_created'
      ELSE 'member_pulse_campaign_status_changed' END;
  END IF;
  INSERT INTO public.chapter_audit_events
    (event_type, subject_type, subject_ref, metadata)
  VALUES
    (audit_event, TG_TABLE_NAME, audit_subject, audit_metadata);
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_member_pulse_campaign
  AFTER INSERT OR UPDATE OF status ON public.member_pulse_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_pulse_metadata();
CREATE TRIGGER audit_member_pulse_response
  AFTER INSERT OR UPDATE ON public.member_pulse_responses
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_pulse_metadata();

ALTER TABLE public.member_pulse_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_pulse_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_pulse_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_pulse_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_pulse_policies, public.member_pulse_templates,
  public.member_pulse_campaigns, public.member_pulse_responses FROM anon, authenticated;
