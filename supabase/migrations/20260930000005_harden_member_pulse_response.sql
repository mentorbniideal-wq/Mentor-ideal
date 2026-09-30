-- A completed response cannot be reopened or altered, even with identical answers.
CREATE OR REPLACE FUNCTION public.guard_member_pulse_response_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE campaign_member UUID; campaign_status TEXT;
BEGIN
  SELECT member_id, status INTO campaign_member, campaign_status
    FROM public.member_pulse_campaigns
    WHERE id = NEW.campaign_id AND chapter_id = NEW.chapter_id;
  IF campaign_member IS NULL THEN RAISE EXCEPTION 'Pulse response campaign scope mismatch'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL AND
     (NEW.answers IS DISTINCT FROM OLD.answers OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'Completed Pulse response is immutable';
  END IF;
  IF campaign_status NOT IN ('sent','opened','in_progress','completed') THEN
    RAISE EXCEPTION 'Pulse campaign is not open for response';
  END IF;
  IF campaign_status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'Pulse campaign is closed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
