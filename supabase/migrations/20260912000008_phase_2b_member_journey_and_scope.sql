-- Phase 2B: tenant columns for the member/LT domain plus a durable member journey.
-- Additive by design. Current BNI IDEAL rows are backfilled; no existing primary
-- key or global uniqueness rule is replaced in this migration.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.lt_terms
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.passport_lt_assignments
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.lt_growth_team_members
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;

-- The Phase 2A catalog has exactly one installed Chapter. This deliberately
-- backfills only rows without a tenant and remains a no-op once a pilot exists.
WITH installed_chapter AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.members SET chapter_id = installed_chapter.id
FROM installed_chapter WHERE members.chapter_id IS NULL;
WITH installed_chapter AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.role_assignments SET chapter_id = installed_chapter.id
FROM installed_chapter WHERE role_assignments.chapter_id IS NULL;
WITH installed_chapter AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.lt_terms SET chapter_id = installed_chapter.id
FROM installed_chapter WHERE lt_terms.chapter_id IS NULL;
UPDATE public.passport_lt_assignments a
SET chapter_id = t.chapter_id
FROM public.lt_terms t
WHERE a.term_id = t.id AND a.chapter_id IS NULL;
UPDATE public.passport_lt_assignments a
SET chapter_id = m.chapter_id
FROM public.members m
WHERE a.assigned_member_id = m.id AND a.chapter_id IS NULL;
UPDATE public.lt_growth_team_members g
SET chapter_id = t.chapter_id
FROM public.lt_terms t
WHERE g.term_id = t.id AND g.chapter_id IS NULL;
UPDATE public.lt_growth_team_members g
SET chapter_id = m.chapter_id
FROM public.members m
WHERE g.member_id = m.id AND g.chapter_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_members_chapter_active
  ON public.members(chapter_id, is_archived, name);
CREATE INDEX IF NOT EXISTS idx_role_assignments_chapter_access
  ON public.role_assignments(chapter_id, access_status, email);
CREATE INDEX IF NOT EXISTS idx_lt_terms_chapter_dates
  ON public.lt_terms(chapter_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS idx_passport_lt_assignments_chapter_term
  ON public.passport_lt_assignments(chapter_id, term_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lt_growth_team_chapter_term
  ON public.lt_growth_team_members(chapter_id, term_id, position);

CREATE TABLE IF NOT EXISTS public.member_journey_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'membership_started', 'membership_ended',
    'lt_role_started', 'lt_role_ended',
    'growth_role_started', 'growth_role_ended',
    'note'
  )),
  role_title TEXT,
  term_id UUID REFERENCES public.lt_terms(id) ON DELETE SET NULL,
  starts_on DATE,
  ends_on DATE,
  occurred_on DATE NOT NULL,
  note TEXT,
  source TEXT NOT NULL CHECK (source IN ('system', 'backfill', 'manual')),
  source_ref TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  UNIQUE(chapter_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_member_journey_events_member_date
  ON public.member_journey_events(chapter_id, member_id, occurred_on DESC, created_at DESC);
ALTER TABLE public.member_journey_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_journey_events FROM anon, authenticated;

-- Make the existing verified membership date visible as a durable timeline
-- event. Unknown dates are intentionally not guessed from created_at.
INSERT INTO public.member_journey_events(
  chapter_id, member_id, event_type, starts_on, occurred_on, source, source_ref, note
)
SELECT m.chapter_id, m.id, 'membership_started', m.membership_start_date,
       m.membership_start_date, 'backfill', 'membership:' || m.id::text,
       'วันที่เริ่มสมาชิกจากรายงาน BNI Connect'
FROM public.members m
WHERE m.chapter_id IS NOT NULL AND m.membership_start_date IS NOT NULL
ON CONFLICT (chapter_id, source_ref) DO NOTHING;

-- Preserve known LT and Growth assignments as history. Rows with an unknown
-- term start remain editable through the manual history endpoint instead of
-- silently inventing a date.
INSERT INTO public.member_journey_events(
  chapter_id, member_id, event_type, role_title, term_id, starts_on, ends_on,
  occurred_on, source, source_ref
)
SELECT a.chapter_id, a.assigned_member_id, 'lt_role_started', a.lt_role, a.term_id,
       COALESCE(a.term_start, t.starts_on), COALESCE(a.term_end, t.ends_on),
       COALESCE(a.term_start, t.starts_on), 'backfill', 'passport_lt:' || a.id::text || ':start'
FROM public.passport_lt_assignments a
LEFT JOIN public.lt_terms t ON t.id = a.term_id
WHERE a.chapter_id IS NOT NULL AND a.assigned_member_id IS NOT NULL
  AND COALESCE(a.term_start, t.starts_on) IS NOT NULL
ON CONFLICT (chapter_id, source_ref) DO NOTHING;

INSERT INTO public.member_journey_events(
  chapter_id, member_id, event_type, role_title, term_id, starts_on, ends_on,
  occurred_on, source, source_ref
)
SELECT g.chapter_id, g.member_id, 'growth_role_started',
       CASE WHEN g.position = 'lead' THEN 'Growth Lead' ELSE 'Growth Co-Lead' END,
       g.term_id, t.starts_on, t.ends_on, t.starts_on, 'backfill',
       'growth_team:' || g.id::text || ':start'
FROM public.lt_growth_team_members g
JOIN public.lt_terms t ON t.id = g.term_id
WHERE g.chapter_id IS NOT NULL
ON CONFLICT (chapter_id, source_ref) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_record_member_lt_journey()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_chapter UUID;
  v_start DATE;
  v_end DATE;
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.assigned_member_id IS DISTINCT FROM OLD.assigned_member_id
      OR NEW.lt_role IS DISTINCT FROM OLD.lt_role OR NEW.term_id IS DISTINCT FROM OLD.term_id) THEN
    IF TG_OP = 'UPDATE' AND OLD.assigned_member_id IS NOT NULL THEN
      INSERT INTO public.member_journey_events(chapter_id, member_id, event_type, role_title, term_id, ends_on, occurred_on, source, source_ref)
      VALUES (OLD.chapter_id, OLD.assigned_member_id, 'lt_role_ended', OLD.lt_role, OLD.term_id,
        COALESCE(OLD.term_end, CURRENT_DATE), COALESCE(OLD.term_end, CURRENT_DATE), 'system', 'passport_lt:' || OLD.id::text || ':end:' || CURRENT_DATE::text)
      ON CONFLICT (chapter_id, source_ref) DO NOTHING;
    END IF;
    IF NEW.assigned_member_id IS NOT NULL AND NEW.chapter_id IS NOT NULL THEN
      SELECT starts_on, ends_on INTO v_start, v_end FROM public.lt_terms WHERE id = NEW.term_id;
      INSERT INTO public.member_journey_events(chapter_id, member_id, event_type, role_title, term_id, starts_on, ends_on, occurred_on, source, source_ref)
      VALUES (NEW.chapter_id, NEW.assigned_member_id, 'lt_role_started', NEW.lt_role, NEW.term_id,
        COALESCE(NEW.term_start, v_start), COALESCE(NEW.term_end, v_end), COALESCE(NEW.term_start, v_start, CURRENT_DATE), 'system', 'passport_lt:' || NEW.id::text || ':start')
      ON CONFLICT (chapter_id, source_ref) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active AND OLD.assigned_member_id IS NOT NULL THEN
    INSERT INTO public.member_journey_events(chapter_id, member_id, event_type, role_title, term_id, ends_on, occurred_on, source, source_ref)
    VALUES (OLD.chapter_id, OLD.assigned_member_id, 'lt_role_ended', OLD.lt_role, OLD.term_id,
      COALESCE(OLD.term_end, CURRENT_DATE), COALESCE(OLD.term_end, CURRENT_DATE), 'system', 'passport_lt:' || OLD.id::text || ':end:' || CURRENT_DATE::text)
    ON CONFLICT (chapter_id, source_ref) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_member_lt_journey ON public.passport_lt_assignments;
CREATE TRIGGER trg_record_member_lt_journey
AFTER INSERT OR UPDATE ON public.passport_lt_assignments
FOR EACH ROW EXECUTE FUNCTION public.fn_record_member_lt_journey();

CREATE OR REPLACE FUNCTION public.fn_record_member_growth_journey()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_title TEXT;
BEGIN
  v_title := CASE WHEN COALESCE(NEW.position, OLD.position) = 'lead' THEN 'Growth Lead' ELSE 'Growth Co-Lead' END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_journey_events(chapter_id, member_id, event_type, role_title, term_id, starts_on, occurred_on, source, source_ref)
    SELECT NEW.chapter_id, NEW.member_id, 'growth_role_started', v_title, NEW.term_id, t.starts_on, t.starts_on, 'system', 'growth_team:' || NEW.id::text || ':start'
    FROM public.lt_terms t WHERE t.id = NEW.term_id AND NEW.chapter_id IS NOT NULL
    ON CONFLICT (chapter_id, source_ref) DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.member_journey_events(chapter_id, member_id, event_type, role_title, term_id, ends_on, occurred_on, source, source_ref)
    VALUES (OLD.chapter_id, OLD.member_id, 'growth_role_ended', v_title, OLD.term_id, CURRENT_DATE, CURRENT_DATE, 'system', 'growth_team:' || OLD.id::text || ':end:' || CURRENT_DATE::text)
    ON CONFLICT (chapter_id, source_ref) DO NOTHING;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_record_member_growth_journey ON public.lt_growth_team_members;
CREATE TRIGGER trg_record_member_growth_journey
AFTER INSERT OR DELETE ON public.lt_growth_team_members
FOR EACH ROW EXECUTE FUNCTION public.fn_record_member_growth_journey();

COMMENT ON TABLE public.member_journey_events IS
  'Tenant-scoped, auditable member membership and leadership history. Manual corrections retain author and source; system events are append-only.';
