-- Database-level guardrails for the 1-2-1 lifecycle.  API checks improve UX;
-- these constraints are the final protection against concurrent MC actions.

CREATE OR REPLACE FUNCTION public.enforce_one_active_one_to_one_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('confirmed','sending','sent','partially_failed')
     OR (TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','sending','sent','partially_failed')) THEN
    RETURN NEW;
  END IF;

  -- Serialize activation per member, in a stable order, before checking overlap.
  -- This prevents two concurrent draft sends from both passing a read-then-write check.
  PERFORM pg_advisory_xact_lock(hashtext(member_id::text))
  FROM (
    SELECT DISTINCT member_id
    FROM public.matching_pairs p
    CROSS JOIN LATERAL unnest(ARRAY[p.member_a_id,p.member_b_id,p.optional_member_c_id]) AS u(member_id)
    WHERE p.round_id=NEW.id AND member_id IS NOT NULL
    ORDER BY member_id
  ) locked_members;

  IF EXISTS (
    SELECT 1
    FROM public.matching_pairs candidate
    JOIN public.matching_pairs existing ON existing.id<>candidate.id
    JOIN public.matching_rounds existing_round ON existing_round.id=existing.round_id
    WHERE candidate.round_id=NEW.id
      AND candidate.archived_at IS NULL
      AND candidate.status IN ('matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified','overdue','unable_to_contact','missed_appointment')
      AND existing.archived_at IS NULL
      AND existing.status IN ('matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified','overdue','unable_to_contact','missed_appointment')
      AND existing_round.status IN ('confirmed','sending','sent','partially_failed')
      AND ARRAY[candidate.member_a_id,candidate.member_b_id,candidate.optional_member_c_id]
          && ARRAY[existing.member_a_id,existing.member_b_id,existing.optional_member_c_id]
  ) THEN
    RAISE EXCEPTION 'A member already has an active 1-2-1 pair';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_one_active_one_to_one_pair ON public.matching_rounds;
CREATE TRIGGER trg_enforce_one_active_one_to_one_pair
BEFORE UPDATE OF status ON public.matching_rounds
FOR EACH ROW EXECUTE FUNCTION public.enforce_one_active_one_to_one_pair();

CREATE OR REPLACE FUNCTION public.release_one_to_one_pair_for_rematch(
  p_pair_id UUID,
  p_reason TEXT,
  p_released_by TEXT,
  p_actor_role TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pair public.matching_pairs%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_member_id UUID;
BEGIN
  SELECT * INTO v_pair FROM public.matching_pairs WHERE id=p_pair_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pair not found or already closed'; END IF;
  IF v_pair.optional_member_c_id IS NOT NULL THEN RAISE EXCEPTION 'Legacy three-member groups require manual MC handling'; END IF;
  IF v_pair.status IN ('verified','late_verified') THEN RAISE EXCEPTION 'Completed pairs cannot be released for re-match'; END IF;
  IF EXISTS (SELECT 1 FROM public.one_to_one_schedules WHERE pair_id=p_pair_id AND status='confirmed') THEN
    RAISE EXCEPTION 'A confirmed appointment must be cancelled or rescheduled first';
  END IF;

  UPDATE public.one_to_one_schedules
  SET status='cancelled', change_reason='Released for re-match: '||p_reason, changed_by=p_actor_role, updated_at=v_now
  WHERE pair_id=p_pair_id AND status IN ('proposed','rescheduled');
  UPDATE public.one_to_one_follow_up_actions
  SET status='cancelled', outcome='Pair released for re-match: '||p_reason, updated_at=v_now
  WHERE pair_id=p_pair_id AND status IN ('pending','in_progress','overdue');
  UPDATE public.one_to_one_attention_items
  SET status='resolved', resolution='MC released pair for re-match: '||p_reason, resolved_at=v_now, updated_at=v_now
  WHERE pair_id=p_pair_id AND status IN ('open','reviewed','in_progress','waiting_member','snoozed');

  FOREACH v_member_id IN ARRAY ARRAY[v_pair.member_a_id,v_pair.member_b_id] LOOP
    INSERT INTO public.one_to_one_rematch_requests(pair_id,member_id,status,priority_points,reason,released_by,released_at)
    VALUES(p_pair_id,v_member_id,'waiting',1,p_reason,p_released_by,v_now)
    ON CONFLICT(pair_id,member_id) DO UPDATE SET status='waiting', priority_points=EXCLUDED.priority_points,
      reason=EXCLUDED.reason, released_by=EXCLUDED.released_by, released_at=EXCLUDED.released_at,
      consumed_by_pair_id=NULL, resolved_at=NULL;
  END LOOP;

  UPDATE public.matching_pairs
  SET status='released', archived_at=v_now, release_reason=p_reason, released_at=v_now,
      released_by=p_released_by, cancellation_reason=p_reason
  WHERE id=p_pair_id;
  INSERT INTO public.one_to_one_status_events(round_id,pair_id,event_type,actor_type,actor_ref,metadata)
  VALUES(v_pair.round_id,p_pair_id,'pair_released_for_rematch','mc',p_actor_role,jsonb_build_object('reason',p_reason,'rematchQueued',true));
  INSERT INTO public.chapter_audit_events(event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES('one_to_one_pair_released_for_rematch',p_actor_role,p_released_by,'matching_pair',p_pair_id::text,jsonb_build_object('reason',p_reason,'round_id',v_pair.round_id));
  RETURN jsonb_build_object('pairId',p_pair_id,'releasedAt',v_now,'rematchQueued',true);
END;
$$;

REVOKE ALL ON FUNCTION public.release_one_to_one_pair_for_rematch(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_one_to_one_pair_for_rematch(UUID,TEXT,TEXT,TEXT) TO service_role;
