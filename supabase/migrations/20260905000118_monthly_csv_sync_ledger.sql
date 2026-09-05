-- Auditable Monthly CSV Sync batches. Source CSV bodies are never persisted.
CREATE TABLE IF NOT EXISTS public.monthly_sync_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  file_hashes JSONB NOT NULL CHECK (jsonb_typeof(file_hashes) = 'object'),
  combined_hash TEXT NOT NULL CHECK (combined_hash ~ '^[0-9a-f]{64}$'),
  preview_token TEXT NOT NULL CHECK (preview_token ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed','running','completed','completed_with_warnings','failed','rolled_back')),
  source_files JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_files) = 'object'),
  affected_member_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(affected_member_ids) = 'array'),
  quality_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quality_summary) = 'object'),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary) = 'object'),
  before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(after_snapshot) = 'object'),
  error_summary TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by TEXT,
  UNIQUE(chapter_id, combined_hash)
);

CREATE INDEX IF NOT EXISTS idx_monthly_sync_batches_recent
  ON public.monthly_sync_batches(chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_sync_batches_period
  ON public.monthly_sync_batches(chapter_id, period_year DESC, period_month DESC);

ALTER TABLE public.monthly_sync_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_sync_batches FROM anon, authenticated;

COMMENT ON TABLE public.monthly_sync_batches IS
  'Service-only Monthly CSV Sync ledger with hashes, quality result, and before/after rollback snapshots. Raw CSV is never stored.';

-- Restore the latest completed batch atomically. If any restore statement fails,
-- PostgreSQL rolls the entire function call back instead of leaving mixed data.
CREATE OR REPLACE FUNCTION public.fn_rollback_monthly_sync(
  p_batch_id UUID,
  p_actor TEXT DEFAULT 'Chapter Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.monthly_sync_batches%ROWTYPE;
  v_member_ids UUID[] := ARRAY[]::UUID[];
  v_rolled_back_at TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_batch
  FROM public.monthly_sync_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monthly Sync batch not found';
  END IF;
  IF v_batch.status NOT IN ('completed', 'completed_with_warnings') THEN
    RAISE EXCEPTION 'Only a completed Monthly Sync batch can be rolled back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.monthly_sync_batches newer
    WHERE newer.chapter_id = v_batch.chapter_id
      AND newer.status IN ('completed', 'completed_with_warnings')
      AND newer.completed_at > v_batch.completed_at
  ) THEN
    RAISE EXCEPTION 'Only the latest completed Monthly Sync batch can be rolled back';
  END IF;

  SELECT COALESCE(array_agg(value::UUID), ARRAY[]::UUID[])
  INTO v_member_ids
  FROM jsonb_array_elements_text(v_batch.affected_member_ids);

  IF cardinality(v_member_ids) > 0 THEN
    DELETE FROM public.monthly_scores WHERE member_id = ANY(v_member_ids);
    INSERT INTO public.monthly_scores
      SELECT * FROM jsonb_populate_recordset(NULL::public.monthly_scores, COALESCE(v_batch.before_snapshot->'monthlyScores', '[]'::JSONB));

    DELETE FROM public.palms_key_snapshots WHERE member_id = ANY(v_member_ids);
    INSERT INTO public.palms_key_snapshots
      SELECT * FROM jsonb_populate_recordset(NULL::public.palms_key_snapshots, COALESCE(v_batch.before_snapshot->'keySnapshots', '[]'::JSONB));

    DELETE FROM public.r2y_stats WHERE member_id = ANY(v_member_ids);
    INSERT INTO public.r2y_stats
      SELECT * FROM jsonb_populate_recordset(NULL::public.r2y_stats, COALESCE(v_batch.before_snapshot->'r2yStats', '[]'::JSONB));

    DELETE FROM public.traffic_light_evolution_summary WHERE member_id = ANY(v_member_ids);
    INSERT INTO public.traffic_light_evolution_summary
      SELECT * FROM jsonb_populate_recordset(NULL::public.traffic_light_evolution_summary, COALESCE(v_batch.before_snapshot->'evolution', '[]'::JSONB));

    DELETE FROM public.renewals WHERE member_id = ANY(v_member_ids);
    INSERT INTO public.renewals
      SELECT * FROM jsonb_populate_recordset(NULL::public.renewals, COALESCE(v_batch.before_snapshot->'renewals', '[]'::JSONB));

    UPDATE public.members member
    SET email = snapshot.email,
        phone = snapshot.phone
    FROM jsonb_to_recordset(COALESCE(v_batch.before_snapshot->'members', '[]'::JSONB))
      AS snapshot(id UUID, email TEXT, phone TEXT)
    WHERE member.id = snapshot.id;
  END IF;

  UPDATE public.monthly_sync_batches
  SET status = 'rolled_back', rolled_back_at = v_rolled_back_at,
      rolled_back_by = LEFT(COALESCE(NULLIF(p_actor, ''), 'Chapter Admin'), 255)
  WHERE id = p_batch_id;

  INSERT INTO public.chapter_audit_events(
    event_type, actor_role, actor_ref, subject_type, subject_ref, metadata
  ) VALUES (
    'monthly_csv_sync_rolled_back', 'mc', LEFT(COALESCE(NULLIF(p_actor, ''), 'Chapter Admin'), 255),
    'monthly_sync_batch', p_batch_id::TEXT,
    jsonb_build_object(
      'period', format('%s-%s', v_batch.period_year, lpad(v_batch.period_month::TEXT, 2, '0')),
      'affected_members', cardinality(v_member_ids)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'batchId', p_batch_id,
    'restoredMembers', cardinality(v_member_ids),
    'rolledBackAt', v_rolled_back_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rollback_monthly_sync(UUID, TEXT) FROM PUBLIC, anon, authenticated;
