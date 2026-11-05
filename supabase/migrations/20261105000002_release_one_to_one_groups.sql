-- Scoped, atomic operator release for both pairs and exceptional trios.
CREATE OR REPLACE FUNCTION public.release_one_to_one_group_for_rematch(
  p_chapter_id uuid, p_pair_id uuid, p_reason text, p_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pair public.matching_pairs%ROWTYPE;
  participant uuid;
  participants uuid[];
  moment timestamptz := now();
BEGIN
  IF char_length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'กรุณาระบุเหตุผล'; END IF;
  SELECT p.* INTO pair FROM matching_pairs p JOIN matching_rounds r ON r.id=p.round_id
   WHERE p.id=p_pair_id AND r.chapter_id=p_chapter_id FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบคู่ใน Chapter นี้'; END IF;
  IF pair.status='released' THEN RETURN jsonb_build_object('pairId',p_pair_id,'rematchQueued',true,'idempotent',true); END IF;
  IF pair.archived_at IS NOT NULL OR pair.status IN ('verified','late_verified','cancelled','expired','superseded') THEN
    RAISE EXCEPTION 'คู่นี้ปิดขั้นตอนแล้ว ไม่สามารถปล่อยคู่ได้';
  END IF;
  IF EXISTS(SELECT 1 FROM one_to_one_schedules WHERE pair_id=p_pair_id AND status='confirmed') THEN
    RAISE EXCEPTION 'กรุณายกเลิกหรือเลื่อนนัดที่ยืนยันแล้วก่อนปล่อยคู่';
  END IF;
  participants := array_remove(ARRAY[pair.member_a_id,pair.member_b_id,pair.optional_member_c_id],NULL);
  IF EXISTS(SELECT 1 FROM unnest(participants) AS participant_ids(member_id) LEFT JOIN members m ON m.id=participant_ids.member_id WHERE m.id IS NULL OR m.chapter_id IS DISTINCT FROM p_chapter_id) THEN
    RAISE EXCEPTION 'สมาชิกในกลุ่มไม่ตรงกับ Chapter';
  END IF;
  UPDATE one_to_one_schedules SET status='cancelled',change_reason=p_reason,changed_by=p_actor,updated_at=moment
   WHERE pair_id=p_pair_id AND status IN ('proposed','rescheduled');
  UPDATE one_to_one_follow_up_actions SET status='cancelled',outcome='Released for re-match: '||p_reason,updated_at=moment
   WHERE pair_id=p_pair_id AND status IN ('pending','in_progress','overdue');
  UPDATE one_to_one_attention_items SET status='resolved',resolution='Released for re-match: '||p_reason,resolved_at=moment,updated_at=moment
   WHERE pair_id=p_pair_id AND status IN ('open','reviewed','in_progress','waiting_member','snoozed');
  FOREACH participant IN ARRAY participants LOOP
    INSERT INTO one_to_one_rematch_requests(pair_id,member_id,status,priority_points,reason,released_by,released_at)
      VALUES(p_pair_id,participant,'waiting',1,p_reason,p_actor,moment)
      ON CONFLICT(pair_id,member_id) DO UPDATE SET status='waiting',reason=EXCLUDED.reason,
        released_by=EXCLUDED.released_by,released_at=EXCLUDED.released_at,consumed_by_pair_id=NULL,resolved_at=NULL;
  END LOOP;
  UPDATE matching_pairs SET status='released',archived_at=moment,release_reason=p_reason,released_at=moment,
    released_by=p_actor,cancellation_reason=p_reason WHERE id=p_pair_id;
  INSERT INTO one_to_one_status_events(round_id,pair_id,event_type,actor_type,actor_ref,metadata)
    VALUES(pair.round_id,p_pair_id,'pair_released_for_rematch','mc',p_actor,jsonb_build_object('reason',p_reason,'participantCount',cardinality(participants)));
  INSERT INTO chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
    VALUES(p_chapter_id,'one_to_one_group_released','mc',p_actor,'matching_pair',p_pair_id::text,
      jsonb_build_object('reason',p_reason,'participantCount',cardinality(participants)));
  RETURN jsonb_build_object('pairId',p_pair_id,'releasedAt',moment,'rematchQueued',true,'participantCount',cardinality(participants));
END $$;
REVOKE ALL ON FUNCTION public.release_one_to_one_group_for_rematch(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_one_to_one_group_for_rematch(uuid,uuid,text,text) TO service_role;
