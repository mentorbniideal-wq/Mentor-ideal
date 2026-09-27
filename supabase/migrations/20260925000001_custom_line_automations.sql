-- Chapter-scoped, Admin-authored LINE automations.
-- Messages remain disabled until explicitly enabled and are dispatched through
-- the existing LINE delivery ledger / notification guard.

CREATE TABLE IF NOT EXISTS public.line_custom_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),
  recurrence TEXT NOT NULL CHECK (recurrence IN ('once','daily','weekly','monthly')),
  next_run_at TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_by_email TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IS NULL OR last_run_status IN ('completed','partial','failed')),
  last_run_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.line_custom_automation_recipients (
  automation_id UUID NOT NULL REFERENCES public.line_custom_automations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (automation_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_line_custom_automations_due
  ON public.line_custom_automations(next_run_at)
  WHERE enabled = true AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_line_custom_automations_chapter
  ON public.line_custom_automations(chapter_id, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_line_custom_automation_recipients_chapter
  ON public.line_custom_automation_recipients(chapter_id, automation_id);

ALTER TABLE public.line_custom_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_custom_automation_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_custom_automations, public.line_custom_automation_recipients FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_line_custom_automation_recipient_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_automation_chapter UUID;
  v_member_chapter UUID;
BEGIN
  SELECT chapter_id INTO v_automation_chapter FROM public.line_custom_automations WHERE id = NEW.automation_id;
  SELECT chapter_id INTO v_member_chapter FROM public.members WHERE id = NEW.member_id;
  IF v_automation_chapter IS NULL OR v_member_chapter IS NULL
     OR v_automation_chapter IS DISTINCT FROM NEW.chapter_id
     OR v_member_chapter IS DISTINCT FROM NEW.chapter_id THEN
    RAISE EXCEPTION 'custom LINE automation recipient must belong to the same Chapter';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_line_custom_automation_recipient_scope ON public.line_custom_automation_recipients;
CREATE TRIGGER trg_line_custom_automation_recipient_scope
BEFORE INSERT OR UPDATE ON public.line_custom_automation_recipients
FOR EACH ROW EXECUTE FUNCTION public.enforce_line_custom_automation_recipient_scope();

-- Atomic scheduler claim. A stale lock may be retried; the delivery ledger's
-- per-member idempotency key prevents a duplicate LINE push.
CREATE OR REPLACE FUNCTION public.fn_claim_due_line_custom_automations(p_now TIMESTAMPTZ DEFAULT now())
RETURNS SETOF public.line_custom_automations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.line_custom_automations a
  SET locked_at = p_now, updated_at = p_now
  WHERE a.id IN (
    SELECT id FROM public.line_custom_automations
    WHERE enabled = true
      AND archived_at IS NULL
      AND next_run_at <= p_now
      AND (locked_at IS NULL OR locked_at < p_now - interval '15 minutes')
    ORDER BY next_run_at
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  )
  RETURNING a.*;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_due_line_custom_automations(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_due_line_custom_automations(TIMESTAMPTZ) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'custom-line-automations-dispatch') THEN
    PERFORM cron.unschedule('custom-line-automations-dispatch');
  END IF;
  PERFORM cron.schedule(
    'custom-line-automations-dispatch',
    '*/5 * * * *',
    $job$SELECT public.call_edge_function('runCustomLineAutomations');$job$
  );
END $$;

COMMENT ON TABLE public.line_custom_automations IS
  'Chapter-scoped Admin-authored LINE schedules. No implicit all-member audience.';
COMMENT ON TABLE public.line_custom_automation_recipients IS
  'Exact member allow-list for an Admin-authored LINE automation.';
