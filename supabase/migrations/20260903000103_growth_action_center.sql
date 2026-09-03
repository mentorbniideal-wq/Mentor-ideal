-- Growth Action Center workflow. Additive and backward-compatible.

ALTER TABLE public.growth_tasks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS assigned_owner_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.growth_tasks
SET status = CASE WHEN responded_at IS NOT NULL THEN 'completed' ELSE 'new' END,
    completed_at = CASE WHEN responded_at IS NOT NULL THEN responded_at ELSE completed_at END
WHERE (responded_at IS NOT NULL AND status = 'new')
   OR status IS NULL
   OR status NOT IN ('new','accepted','in_progress','waiting_member','completed','cancelled');

ALTER TABLE public.growth_tasks DROP CONSTRAINT IF EXISTS growth_tasks_status_check;
ALTER TABLE public.growth_tasks
  ADD CONSTRAINT growth_tasks_status_check
  CHECK (status IN ('new','accepted','in_progress','waiting_member','completed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_growth_tasks_status_due
  ON public.growth_tasks(status, due_date)
  WHERE status NOT IN ('completed','cancelled');
CREATE INDEX IF NOT EXISTS idx_growth_tasks_member_status
  ON public.growth_tasks(member_id, status);

CREATE OR REPLACE FUNCTION public.touch_growth_task_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_growth_task_updated_at ON public.growth_tasks;
CREATE TRIGGER trg_touch_growth_task_updated_at
BEFORE UPDATE ON public.growth_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_growth_task_updated_at();
