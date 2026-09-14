-- Phase 2D: tenant-scope the Weekly MY121 root records and remembered aliases.
-- Child workflow rows remain scoped through matching_rounds -> matching_pairs.

ALTER TABLE public.matching_rounds
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.matching_forbidden_pairs
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.one_to_one_member_name_aliases
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.chapter_audit_events
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;

-- Prefer evidence from the pair participants. The final fallback preserves the
-- current single-Chapter installation for old rounds that have no pairs.
WITH inferred AS (
  SELECT p.round_id, min(m.chapter_id::text)::uuid AS chapter_id
  FROM public.matching_pairs p
  JOIN public.members m ON m.id = p.member_a_id
  GROUP BY p.round_id
)
UPDATE public.matching_rounds r SET chapter_id = inferred.chapter_id
FROM inferred WHERE r.id = inferred.round_id AND r.chapter_id IS NULL;

WITH installed AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.matching_rounds r SET chapter_id = installed.id
FROM installed WHERE r.chapter_id IS NULL;

UPDATE public.matching_forbidden_pairs f SET chapter_id = m.chapter_id
FROM public.members m WHERE f.member_low_id = m.id AND f.chapter_id IS NULL;

UPDATE public.one_to_one_member_name_aliases a SET chapter_id = m.chapter_id
FROM public.members m WHERE a.member_id = m.id AND a.chapter_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.matching_rounds WHERE chapter_id IS NULL) THEN
    RAISE EXCEPTION 'matching_rounds chapter backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matching_forbidden_pairs WHERE chapter_id IS NULL) THEN
    RAISE EXCEPTION 'matching_forbidden_pairs chapter backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.one_to_one_member_name_aliases WHERE chapter_id IS NULL) THEN
    RAISE EXCEPTION 'one_to_one_member_name_aliases chapter backfill incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matching_pairs p
    JOIN public.matching_rounds r ON r.id=p.round_id
    JOIN public.members a ON a.id=p.member_a_id
    JOIN public.members b ON b.id=p.member_b_id
    LEFT JOIN public.members c ON c.id=p.optional_member_c_id
    WHERE a.chapter_id IS DISTINCT FROM r.chapter_id
       OR b.chapter_id IS DISTINCT FROM r.chapter_id
       OR (p.optional_member_c_id IS NOT NULL AND c.chapter_id IS DISTINCT FROM r.chapter_id)
  ) THEN
    RAISE EXCEPTION 'matching_pairs contain cross-Chapter participants';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matching_forbidden_pairs f
    JOIN public.members low_member ON low_member.id=f.member_low_id
    JOIN public.members high_member ON high_member.id=f.member_high_id
    WHERE low_member.chapter_id IS DISTINCT FROM f.chapter_id
       OR high_member.chapter_id IS DISTINCT FROM f.chapter_id
  ) THEN
    RAISE EXCEPTION 'matching_forbidden_pairs contain cross-Chapter members';
  END IF;
END $$;

ALTER TABLE public.matching_rounds ALTER COLUMN chapter_id SET NOT NULL;
ALTER TABLE public.matching_forbidden_pairs ALTER COLUMN chapter_id SET NOT NULL;
ALTER TABLE public.one_to_one_member_name_aliases ALTER COLUMN chapter_id SET NOT NULL;

ALTER TABLE public.one_to_one_member_name_aliases
  DROP CONSTRAINT IF EXISTS one_to_one_member_name_aliases_normalized_name_key;
ALTER TABLE public.one_to_one_member_name_aliases
  ADD CONSTRAINT one_to_one_member_name_aliases_chapter_name_key UNIQUE(chapter_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_matching_rounds_chapter_date
  ON public.matching_rounds(chapter_id, meeting_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matching_rounds_chapter_status
  ON public.matching_rounds(chapter_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matching_forbidden_pairs_chapter
  ON public.matching_forbidden_pairs(chapter_id, is_active);
CREATE INDEX IF NOT EXISTS idx_121_name_aliases_chapter_member
  ON public.one_to_one_member_name_aliases(chapter_id, member_id);
CREATE INDEX IF NOT EXISTS idx_chapter_audit_events_chapter_created
  ON public.chapter_audit_events(chapter_id, created_at DESC);

COMMENT ON COLUMN public.matching_rounds.chapter_id IS
  'Server-derived Chapter scope for the complete Weekly MY121 workflow tree.';
COMMENT ON COLUMN public.one_to_one_member_name_aliases.chapter_id IS
  'Chapter scope for conservative recurring CSV name resolution.';
COMMENT ON COLUMN public.chapter_audit_events.chapter_id IS
  'Tenant scope for audit filtering. Nullable temporarily for legacy writers outside tenant-ready modules.';

CREATE OR REPLACE FUNCTION public.enforce_matching_pair_chapter_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_round_chapter UUID;
  v_a_chapter UUID;
  v_b_chapter UUID;
  v_c_chapter UUID;
BEGIN
  SELECT chapter_id INTO v_round_chapter FROM public.matching_rounds WHERE id = NEW.round_id;
  SELECT chapter_id INTO v_a_chapter FROM public.members WHERE id = NEW.member_a_id;
  SELECT chapter_id INTO v_b_chapter FROM public.members WHERE id = NEW.member_b_id;
  IF NEW.optional_member_c_id IS NOT NULL THEN
    SELECT chapter_id INTO v_c_chapter FROM public.members WHERE id = NEW.optional_member_c_id;
  END IF;
  IF v_round_chapter IS NULL OR v_a_chapter IS DISTINCT FROM v_round_chapter
     OR v_b_chapter IS DISTINCT FROM v_round_chapter
     OR (NEW.optional_member_c_id IS NOT NULL AND v_c_chapter IS DISTINCT FROM v_round_chapter) THEN
    RAISE EXCEPTION 'MY121 pair participants must belong to the round Chapter';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matching_pair_chapter_scope ON public.matching_pairs;
CREATE TRIGGER trg_matching_pair_chapter_scope
BEFORE INSERT OR UPDATE OF round_id, member_a_id, member_b_id, optional_member_c_id ON public.matching_pairs
FOR EACH ROW EXECUTE FUNCTION public.enforce_matching_pair_chapter_scope();

CREATE OR REPLACE FUNCTION public.enforce_member_scoped_chapter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_low_chapter UUID;
  v_high_chapter UUID;
  v_member_chapter UUID;
BEGIN
  IF TG_TABLE_NAME = 'matching_forbidden_pairs' THEN
    SELECT chapter_id INTO v_low_chapter FROM public.members WHERE id = NEW.member_low_id;
    SELECT chapter_id INTO v_high_chapter FROM public.members WHERE id = NEW.member_high_id;
    IF v_low_chapter IS DISTINCT FROM NEW.chapter_id OR v_high_chapter IS DISTINCT FROM NEW.chapter_id THEN
      RAISE EXCEPTION 'Forbidden-pair members must belong to the selected Chapter';
    END IF;
  ELSE
    SELECT chapter_id INTO v_member_chapter FROM public.members WHERE id = NEW.member_id;
    IF v_member_chapter IS DISTINCT FROM NEW.chapter_id THEN
      RAISE EXCEPTION 'Member alias must belong to the selected Chapter';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matching_forbidden_pair_chapter_scope ON public.matching_forbidden_pairs;
CREATE TRIGGER trg_matching_forbidden_pair_chapter_scope
BEFORE INSERT OR UPDATE OF chapter_id, member_low_id, member_high_id ON public.matching_forbidden_pairs
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_scoped_chapter();

DROP TRIGGER IF EXISTS trg_one_to_one_alias_chapter_scope ON public.one_to_one_member_name_aliases;
CREATE TRIGGER trg_one_to_one_alias_chapter_scope
BEFORE INSERT OR UPDATE OF chapter_id, member_id ON public.one_to_one_member_name_aliases
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_scoped_chapter();

-- Keep database-owned creation paths working after matching_rounds.chapter_id
-- becomes mandatory. Both functions derive Chapter from server-side member rows.
CREATE OR REPLACE FUNCTION public.respond_member_one_to_one_invite(
  p_invite_id UUID,
  p_actor_member_id UUID,
  p_response TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.member_one_to_one_invites%ROWTYPE;
  v_round_id UUID;
  v_pair_id UUID;
  v_chapter_id UUID;
  v_invitee_chapter_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_invite FROM public.member_one_to_one_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_invite.invitee_member_id <> p_actor_member_id THEN RAISE EXCEPTION 'Only the invited member can respond'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is no longer pending'; END IF;
  IF p_response NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Invalid invitation response'; END IF;
  SELECT chapter_id INTO v_chapter_id FROM public.members WHERE id=v_invite.requester_member_id;
  SELECT chapter_id INTO v_invitee_chapter_id FROM public.members WHERE id=v_invite.invitee_member_id;
  IF v_chapter_id IS NULL OR v_invitee_chapter_id IS DISTINCT FROM v_chapter_id THEN
    RAISE EXCEPTION 'Invitation members must belong to the same Chapter';
  END IF;

  IF p_response='declined' THEN
    UPDATE public.member_one_to_one_invites SET status='declined',responded_at=v_now,updated_at=v_now WHERE id=v_invite.id;
    INSERT INTO public.one_to_one_status_events(member_id,event_type,actor_type,actor_ref,metadata)
    VALUES(p_actor_member_id,'member_self_121_invite_declined','member',p_actor_member_id::text,jsonb_build_object('inviteId',v_invite.id));
    RETURN jsonb_build_object('inviteId',v_invite.id,'status','declined');
  END IF;

  INSERT INTO public.matching_rounds(chapter_id,meeting_date,source_file_name,matching_type,status,created_by,confirmed_by,confirmed_at,system_version,timezone,feature_flag,journey_type)
  VALUES(v_chapter_id,current_date,'Member initiated 1-2-1','member_self','sent','member:'||p_actor_member_id::text,'member:'||p_actor_member_id::text,v_now,2,'Asia/Bangkok','one_to_one_system','member_self')
  RETURNING id INTO v_round_id;
  INSERT INTO public.matching_pairs(round_id,position,member_a_id,member_b_id,is_locked,status,match_reason,constraint_notes)
  VALUES(v_round_id,1,v_invite.requester_member_id,v_invite.invitee_member_id,true,'matched','["member_self"]'::jsonb,'["accepted_by_both_members"]'::jsonb)
  RETURNING id INTO v_pair_id;
  UPDATE public.member_one_to_one_invites
  SET status='accepted',accepted_pair_id=v_pair_id,responded_at=v_now,updated_at=v_now WHERE id=v_invite.id;
  INSERT INTO public.one_to_one_status_events(round_id,pair_id,member_id,event_type,actor_type,actor_ref,metadata)
  VALUES(v_round_id,v_pair_id,p_actor_member_id,'member_self_121_invite_accepted','member',p_actor_member_id::text,jsonb_build_object('inviteId',v_invite.id,'requesterMemberId',v_invite.requester_member_id));
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(v_chapter_id,'member_self_121_invite_accepted','member',p_actor_member_id::text,'matching_pair',v_pair_id::text,jsonb_build_object('inviteId',v_invite.id,'journeyType','member_self'));
  RETURN jsonb_build_object('inviteId',v_invite.id,'status','accepted','pairId',v_pair_id,'roundId',v_round_id);
END;
$$;

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

  INSERT INTO public.matching_rounds(chapter_id,meeting_date,source_file_name,matching_type,repeat_window_weeks,status,created_by,system_version,timezone,opt_in_closes_at,starts_at,ends_at,cross_pool_enabled,feature_flag,message_template_key,replaces_round_id,journey_type)
  VALUES(v_round.chapter_id,v_round.meeting_date,'ส่งใหม่ · '||COALESCE(v_round.source_file_name,'1-2-1'),v_round.matching_type,v_round.repeat_window_weeks,'draft',p_actor,v_round.system_version,v_round.timezone,v_round.opt_in_closes_at,v_round.starts_at,v_round.ends_at,v_round.cross_pool_enabled,v_round.feature_flag,v_round.message_template_key,p_round_id,v_round.journey_type)
  RETURNING id INTO v_replacement_id;

  INSERT INTO public.matching_import_rows(round_id,row_number,first_name_en,last_name_en,normalized_name,substitute_name,looking_for,checkin_date,checkin_time,matched_member_id,import_status,validation_message)
  SELECT v_replacement_id,row_number,first_name_en,last_name_en,normalized_name,substitute_name,looking_for,checkin_date,checkin_time,matched_member_id,import_status,validation_message
  FROM public.matching_import_rows WHERE round_id=p_round_id;
  INSERT INTO public.round_eligibility(round_id,member_id,source,status,preference,priority_points,reason,responded_at)
  SELECT v_replacement_id,member_id,source,CASE WHEN status IN ('waiting','matched') THEN 'eligible' ELSE status END,preference,priority_points,reason,responded_at
  FROM public.round_eligibility WHERE round_id=p_round_id;
  INSERT INTO public.one_to_one_status_events(round_id,event_type,actor_type,actor_ref,metadata)
  VALUES(v_replacement_id,'replacement_round_created','admin',p_actor,jsonb_build_object('replacesRoundId',p_round_id,'reason',left(trim(p_reason),500),'pairsCopied',false));
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(v_round.chapter_id,'weekly_121_round_replaced','admin',p_actor,'matching_round',v_replacement_id::text,jsonb_build_object('replaces_round_id',p_round_id,'reason',left(trim(p_reason),500)));
  RETURN jsonb_build_object('cancelled',true,'replacementRoundId',v_replacement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_member_one_to_one_invite(UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_member_one_to_one_invite(UUID,UUID,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_weekly_121_round_with_replacement(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_weekly_121_round_with_replacement(UUID,TEXT,TEXT) TO service_role;
