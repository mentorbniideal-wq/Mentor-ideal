-- Preserve each imported source independently. These values are report snapshots,
-- not verified monthly activity; source windows are unknown in the supplied CSVs.
CREATE TABLE public.member_performance_source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source_type TEXT NOT NULL CHECK (source_type IN ('member_traffic_light', 'reporting2you')),
  import_batch_id UUID NOT NULL REFERENCES public.monthly_sync_batches(id) ON DELETE RESTRICT,
  source_semantics TEXT NOT NULL DEFAULT 'needs_verification'
    CHECK (source_semantics IN ('monthly', 'cumulative', 'rolling_period', 'lifetime', 'snapshot_only', 'needs_verification')),
  window_start DATE,
  window_end DATE,
  referrals_given NUMERIC(14,2),
  referrals_received NUMERIC(14,2),
  tyfcb_given NUMERIC(18,2),
  tyfcb_received NUMERIC(18,2),
  visitors NUMERIC(14,2),
  one_to_ones NUMERIC(14,2),
  ceu NUMERIC(14,2),
  traffic_light_points NUMERIC(8,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((window_start IS NULL AND window_end IS NULL) OR (window_start IS NOT NULL AND window_end IS NOT NULL AND window_start <= window_end)),
  UNIQUE (chapter_id, member_id, period_year, period_month, source_type)
);

CREATE INDEX member_performance_source_snapshots_member_period_idx
  ON public.member_performance_source_snapshots(chapter_id, member_id, period_year DESC, period_month DESC);
CREATE INDEX member_performance_source_snapshots_batch_idx
  ON public.member_performance_source_snapshots(import_batch_id);

CREATE OR REPLACE FUNCTION public.fn_check_member_performance_snapshot_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = NEW.member_id AND chapter_id = NEW.chapter_id) THEN
    RAISE EXCEPTION 'Performance snapshot member outside Chapter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.monthly_sync_batches
    WHERE id = NEW.import_batch_id AND chapter_id = NEW.chapter_id
      AND period_year = NEW.period_year AND period_month = NEW.period_month) THEN
    RAISE EXCEPTION 'Performance snapshot batch scope or period mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_member_performance_snapshot_scope
  BEFORE INSERT OR UPDATE ON public.member_performance_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_member_performance_snapshot_scope();

ALTER TABLE public.member_performance_source_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_performance_source_snapshots FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_check_member_performance_snapshot_scope() FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.member_performance_source_snapshots IS
  'Service-only source-scoped historical report values. Do not interpret as monthly activity unless source_semantics and source window are verified.';

-- The existing rollback RPC changes batch status inside one transaction. Restore
-- source snapshots when that status changes; older batches have no snapshot key.
CREATE OR REPLACE FUNCTION public.fn_restore_member_performance_on_sync_rollback()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('completed', 'completed_with_warnings') AND NEW.status = 'rolled_back'
    AND (OLD.before_snapshot ? 'performanceSnapshots') THEN
    DELETE FROM public.member_performance_source_snapshots
    WHERE chapter_id = OLD.chapter_id AND period_year = OLD.period_year AND period_month = OLD.period_month
      AND member_id IN (SELECT value::UUID FROM jsonb_array_elements_text(OLD.affected_member_ids));
    INSERT INTO public.member_performance_source_snapshots
      SELECT * FROM jsonb_populate_recordset(NULL::public.member_performance_source_snapshots,
        COALESCE(OLD.before_snapshot->'performanceSnapshots', '[]'::JSONB));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER restore_member_performance_on_sync_rollback
  AFTER UPDATE OF status ON public.monthly_sync_batches
  FOR EACH ROW EXECUTE FUNCTION public.fn_restore_member_performance_on_sync_rollback();
REVOKE ALL ON FUNCTION public.fn_restore_member_performance_on_sync_rollback() FROM PUBLIC, anon, authenticated;
