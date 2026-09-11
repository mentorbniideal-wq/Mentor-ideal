-- Re-match waves are queue-driven: a successfully verified Chapter pair becomes
-- eligible for its next conversation without an MC having to watch completion daily.
-- No LINE delivery is created here; MC still reviews a draft and confirms delivery.

CREATE OR REPLACE FUNCTION public.queue_completed_one_to_one_for_rematch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_journey_type TEXT;
  v_member_id UUID;
BEGIN
  IF NEW.status NOT IN ('verified','late_verified')
     OR (TG_OP='UPDATE' AND OLD.status IN ('verified','late_verified')) THEN
    RETURN NEW;
  END IF;
  SELECT journey_type INTO v_journey_type FROM public.matching_rounds WHERE id=NEW.round_id;
  IF COALESCE(v_journey_type,'chapter') <> 'chapter' THEN RETURN NEW; END IF;
  FOREACH v_member_id IN ARRAY ARRAY[NEW.member_a_id,NEW.member_b_id,NEW.optional_member_c_id] LOOP
    IF v_member_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.one_to_one_rematch_requests(pair_id,member_id,status,priority_points,reason,released_by,released_at)
    VALUES(NEW.id,v_member_id,'waiting',0,'completed_cycle','system',now())
    ON CONFLICT(pair_id,member_id) DO NOTHING;
  END LOOP;
  INSERT INTO public.one_to_one_status_events(round_id,pair_id,event_type,actor_type,actor_ref,metadata)
  VALUES(NEW.round_id,NEW.id,'pair_ready_for_rematch_wave','system','system',jsonb_build_object('reason','completed_cycle'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_completed_one_to_one_for_rematch ON public.matching_pairs;
CREATE TRIGGER trg_queue_completed_one_to_one_for_rematch
AFTER UPDATE OF status ON public.matching_pairs
FOR EACH ROW EXECUTE FUNCTION public.queue_completed_one_to_one_for_rematch();

-- Backfill completed Chapter journeys so the first Wave reflects current truth.
INSERT INTO public.one_to_one_rematch_requests(pair_id,member_id,status,priority_points,reason,released_by,released_at)
SELECT pair.id,participant.member_id,'waiting',0,'completed_cycle','system',COALESCE(pair.released_at,pair.created_at)
FROM public.matching_pairs pair
JOIN public.matching_rounds round ON round.id=pair.round_id AND round.journey_type='chapter'
CROSS JOIN LATERAL unnest(ARRAY[pair.member_a_id,pair.member_b_id,pair.optional_member_c_id]) participant(member_id)
WHERE pair.status IN ('verified','late_verified') AND participant.member_id IS NOT NULL
ON CONFLICT(pair_id,member_id) DO NOTHING;

-- Retry may create a new delivery row after the original batch was partially failed.
-- Finalize the round from the delivery ledger, not from a browser request, so retry
-- completion and re-match queue consumption are idempotent.
CREATE OR REPLACE FUNCTION public.finalize_weekly_121_delivery_from_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round_id UUID := NEW.matching_round_id;
  v_expected INTEGER;
  v_delivered INTEGER;
BEGIN
  IF v_round_id IS NULL OR NEW.notification_type <> 'weekly_121_matching' OR NEW.status <> 'sent' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_expected FROM public.matching_pairs p
  WHERE p.round_id=v_round_id AND p.archived_at IS NULL;
  SELECT count(DISTINCT d.member_id) INTO v_delivered FROM public.line_message_deliveries d
  WHERE d.matching_round_id=v_round_id AND d.notification_type='weekly_121_matching' AND d.status='sent';
  IF v_expected=0 THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_expected FROM public.matching_pairs p
  CROSS JOIN LATERAL unnest(ARRAY[p.member_a_id,p.member_b_id,p.optional_member_c_id]) AS participant(member_id)
  WHERE p.round_id=v_round_id AND p.archived_at IS NULL AND participant.member_id IS NOT NULL;
  IF v_delivered < v_expected THEN RETURN NEW; END IF;
  UPDATE public.matching_rounds SET status='sent' WHERE id=v_round_id AND status IN ('sending','partially_failed');
  UPDATE public.one_to_one_rematch_requests request
  SET status='consumed', consumed_by_pair_id=pair.id, resolved_at=now()
  FROM public.matching_pairs pair
  WHERE pair.round_id=v_round_id AND request.member_id IN (pair.member_a_id,pair.member_b_id,pair.optional_member_c_id)
    AND request.status='waiting';
  UPDATE public.matching_pairs prior SET superseded_by_pair_id=pair.id
  FROM public.one_to_one_rematch_requests request, public.matching_pairs pair
  WHERE pair.round_id=v_round_id AND request.consumed_by_pair_id=pair.id
    AND prior.id=request.pair_id AND prior.status='released';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_weekly_121_delivery_from_ledger ON public.line_message_deliveries;
CREATE TRIGGER trg_finalize_weekly_121_delivery_from_ledger
AFTER INSERT OR UPDATE OF status, matching_round_id ON public.line_message_deliveries
FOR EACH ROW EXECUTE FUNCTION public.finalize_weekly_121_delivery_from_ledger();

REVOKE ALL ON FUNCTION public.queue_completed_one_to_one_for_rematch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_weekly_121_delivery_from_ledger() FROM PUBLIC;

-- Cancel + replacement is a single database transaction. A replacement never
-- inherits pairs; it inherits only the auditable source roster and eligibility.
CREATE OR REPLACE FUNCTION public.cancel_weekly_121_round_with_replacement(
  p_round_id UUID,
  p_reason TEXT,
  p_actor TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.matching_rounds%ROWTYPE;
  v_replacement_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_round FROM public.matching_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF v_round.status='draft' THEN RAISE EXCEPTION 'Draft rounds must be deleted instead'; END IF;
  IF v_round.status='cancelled' THEN RAISE EXCEPTION 'Round already cancelled'; END IF;
  IF length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;

  UPDATE public.matching_rounds SET status='cancelled',cancelled_at=v_now,cancelled_by=p_actor,cancellation_reason=left(trim(p_reason),500) WHERE id=p_round_id;
  UPDATE public.one_to_one_schedules SET status='cancelled',updated_at=v_now
    WHERE pair_id IN (SELECT id FROM public.matching_pairs WHERE round_id=p_round_id);
  UPDATE public.pairing_waitlist SET status='withdrawn',resolved_at=v_now
    WHERE round_id=p_round_id AND status IN ('waiting','proposed','carried');
  UPDATE public.matching_pairs SET status='cancelled',archived_at=v_now WHERE round_id=p_round_id;

  INSERT INTO public.matching_rounds(meeting_date,source_file_name,matching_type,repeat_window_weeks,status,created_by,system_version,timezone,opt_in_closes_at,starts_at,ends_at,cross_pool_enabled,feature_flag,message_template_key,replaces_round_id,journey_type)
  VALUES(v_round.meeting_date,'ส่งใหม่ · '||COALESCE(v_round.source_file_name,'1-2-1'),v_round.matching_type,v_round.repeat_window_weeks,'draft',p_actor,v_round.system_version,v_round.timezone,v_round.opt_in_closes_at,v_round.starts_at,v_round.ends_at,v_round.cross_pool_enabled,v_round.feature_flag,v_round.message_template_key,p_round_id,v_round.journey_type)
  RETURNING id INTO v_replacement_id;

  INSERT INTO public.matching_import_rows(round_id,row_number,first_name_en,last_name_en,normalized_name,substitute_name,looking_for,checkin_date,checkin_time,matched_member_id,import_status,validation_message)
  SELECT v_replacement_id,row_number,first_name_en,last_name_en,normalized_name,substitute_name,looking_for,checkin_date,checkin_time,matched_member_id,import_status,validation_message
  FROM public.matching_import_rows WHERE round_id=p_round_id;
  INSERT INTO public.round_eligibility(round_id,member_id,source,status,preference,priority_points,reason,responded_at)
  SELECT v_replacement_id,member_id,source,CASE WHEN status IN ('waiting','matched') THEN 'eligible' ELSE status END,preference,priority_points,reason,responded_at
  FROM public.round_eligibility WHERE round_id=p_round_id;
  INSERT INTO public.one_to_one_status_events(round_id,event_type,actor_type,actor_ref,metadata)
  VALUES(v_replacement_id,'replacement_round_created','admin',p_actor,jsonb_build_object('replacesRoundId',p_round_id,'reason',left(trim(p_reason),500),'pairsCopied',false));
  INSERT INTO public.chapter_audit_events(event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES('weekly_121_round_replaced','admin',p_actor,'matching_round',v_replacement_id::text,jsonb_build_object('replaces_round_id',p_round_id,'reason',left(trim(p_reason),500)));
  RETURN jsonb_build_object('cancelled',true,'replacementRoundId',v_replacement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_weekly_121_round_with_replacement(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_weekly_121_round_with_replacement(UUID,TEXT,TEXT) TO service_role;
