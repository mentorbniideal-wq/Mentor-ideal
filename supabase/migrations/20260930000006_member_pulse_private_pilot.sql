-- Private, opt-in Member Pulse pilot. A chat keyword is navigation, not authority.
-- No LINE delivery or regular scheduling is enabled by this migration.
CREATE TABLE public.member_pulse_pilot_access (
  chapter_id uuid NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  updated_by_email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, member_id)
);
ALTER TABLE public.member_pulse_pilot_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_pulse_pilot_access FROM anon, authenticated;

CREATE FUNCTION public.guard_member_pulse_pilot_access() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = NEW.member_id AND chapter_id = NEW.chapter_id) THEN
    RAISE EXCEPTION 'Pulse pilot member Chapter mismatch';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.chapter_id IS DISTINCT FROM OLD.chapter_id OR NEW.member_id IS DISTINCT FROM OLD.member_id) THEN
    RAISE EXCEPTION 'Pulse pilot identity is immutable';
  END IF;
  NEW.updated_at := now();
  INSERT INTO public.chapter_audit_events(event_type, subject_type, subject_ref, metadata)
  VALUES ('member_pulse_pilot_access_changed', 'member', NEW.member_id::text,
    jsonb_build_object('chapter_id', NEW.chapter_id, 'enabled', NEW.enabled, 'actor', NEW.updated_by_email));
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_member_pulse_pilot_access
  BEFORE INSERT OR UPDATE ON public.member_pulse_pilot_access
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_pulse_pilot_access();

-- A short, explicitly labelled pilot questionnaire. Normal Pulse policy stays off.
INSERT INTO public.member_pulse_templates (chapter_id, stage, version, title, question_spec, active)
SELECT cp.id, 'experience', 1000, 'ทดลอง Member Pulse · รับฟังประสบการณ์สมาชิก',
  '[{"id":"experience_score","label":"ตอนนี้คุณรู้สึกว่าได้รับประโยชน์จากการเป็นสมาชิกมากน้อยเพียงใด (1–10)","type":"scale","required":true,"visibility_scope":"mentor_growth"},{"id":"support_need","label":"มีเรื่องใดที่อยากให้ทีมช่วยเหลือเป็นพิเศษไหม","type":"text","required":false,"visibility_scope":"mentor_growth"},{"id":"follow_up","label":"ต้องการให้ทีมติดต่อกลับหรือไม่","type":"choice","options":["ต้องการ","ยังไม่ต้องการ"],"required":true,"visibility_scope":"mentor_growth"}]'::jsonb,
  false
FROM public.chapter_profiles cp
WHERE cp.chapter_key = 'bni-ideal'
  AND NOT EXISTS (SELECT 1 FROM public.member_pulse_templates t WHERE t.chapter_id = cp.id AND t.stage = 'experience' AND t.version = 1000);

-- Submit and campaign completion commit in the same database transaction.
CREATE FUNCTION public.complete_member_pulse_with_response() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.completed_at IS NULL) THEN
    UPDATE public.member_pulse_campaigns SET status = 'completed', completed_at = NEW.completed_at
    WHERE id = NEW.campaign_id AND chapter_id = NEW.chapter_id
      AND status IN ('sent','opened','in_progress');
    IF NOT FOUND THEN RAISE EXCEPTION 'Pulse campaign is not open for completion'; END IF;
  ELSIF NEW.completed_at IS NULL THEN
    UPDATE public.member_pulse_campaigns SET status = 'in_progress'
    WHERE id = NEW.campaign_id AND chapter_id = NEW.chapter_id AND status IN ('sent','opened');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER complete_member_pulse_with_response
  AFTER INSERT OR UPDATE OF completed_at ON public.member_pulse_responses
  FOR EACH ROW EXECUTE FUNCTION public.complete_member_pulse_with_response();
