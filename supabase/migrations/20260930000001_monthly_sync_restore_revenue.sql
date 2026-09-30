-- Restore the latest sync's member revenue fields as well as contact/score data.
-- Existing batches predate these snapshot keys; they keep legacy rollback behavior.
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
  SELECT * INTO v_batch FROM public.monthly_sync_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly Sync batch not found'; END IF;
  IF v_batch.status NOT IN ('completed', 'completed_with_warnings') THEN
    RAISE EXCEPTION 'Only a completed Monthly Sync batch can be rolled back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.monthly_sync_batches newer
    WHERE newer.chapter_id = v_batch.chapter_id
      AND newer.status IN ('completed', 'completed_with_warnings')
      AND newer.completed_at > v_batch.completed_at
  ) THEN RAISE EXCEPTION 'Only the latest completed Monthly Sync batch can be rolled back'; END IF;

  SELECT COALESCE(array_agg(value::UUID), ARRAY[]::UUID[]) INTO v_member_ids
  FROM jsonb_array_elements_text(v_batch.affected_member_ids);
  IF EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = ANY(v_member_ids) AND m.chapter_id IS DISTINCT FROM v_batch.chapter_id
  ) THEN RAISE EXCEPTION 'Monthly Sync batch contains member outside Chapter'; END IF;

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
    SET email = record.value->>'email',
        phone = record.value->>'phone',
        given_thb = CASE WHEN record.value ? 'given_thb' THEN (record.value->>'given_thb')::NUMERIC ELSE member.given_thb END,
        received_thb = CASE WHEN record.value ? 'received_thb' THEN (record.value->>'received_thb')::NUMERIC ELSE member.received_thb END
    FROM jsonb_array_elements(COALESCE(v_batch.before_snapshot->'members', '[]'::JSONB)) AS record(value)
    WHERE member.id = (record.value->>'id')::UUID AND member.chapter_id = v_batch.chapter_id;
  END IF;

  UPDATE public.monthly_sync_batches
  SET status = 'rolled_back', rolled_back_at = v_rolled_back_at,
      rolled_back_by = LEFT(COALESCE(NULLIF(p_actor, ''), 'Chapter Admin'), 255)
  WHERE id = p_batch_id AND chapter_id = v_batch.chapter_id;

  INSERT INTO public.chapter_audit_events(
    chapter_id, event_type, actor_role, actor_ref, subject_type, subject_ref, metadata
  ) VALUES (
    v_batch.chapter_id, 'monthly_csv_sync_rolled_back', 'mc', LEFT(COALESCE(NULLIF(p_actor, ''), 'Chapter Admin'), 255),
    'monthly_sync_batch', p_batch_id::TEXT,
    jsonb_build_object('period', format('%s-%s', v_batch.period_year, lpad(v_batch.period_month::TEXT, 2, '0')),
      'affected_members', cardinality(v_member_ids))
  );
  RETURN jsonb_build_object('ok', true, 'batchId', p_batch_id,
    'restoredMembers', cardinality(v_member_ids), 'rolledBackAt', v_rolled_back_at);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_rollback_monthly_sync(UUID, TEXT) FROM PUBLIC, anon, authenticated;
