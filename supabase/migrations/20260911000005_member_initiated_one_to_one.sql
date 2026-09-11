-- Member-initiated 1-2-1 stays distinct from Chapter matching, but reuses the
-- verified MY121 journey only after both members agree to meet.

ALTER TABLE public.matching_rounds
  ADD COLUMN IF NOT EXISTS journey_type TEXT NOT NULL DEFAULT 'chapter'
  CHECK (journey_type IN ('chapter','member_self'));

CREATE INDEX IF NOT EXISTS idx_matching_rounds_journey_type
  ON public.matching_rounds(journey_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.member_one_to_one_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  invitee_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  accepted_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL,
  client_action_id UUID,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_member_id <> invitee_member_id),
  UNIQUE(requester_member_id, client_action_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_121_pending_invite_pair
  ON public.member_one_to_one_invites (least(requester_member_id, invitee_member_id), greatest(requester_member_id, invitee_member_id))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_member_121_invites_inbox
  ON public.member_one_to_one_invites(invitee_member_id, status, created_at DESC);

ALTER TABLE public.member_one_to_one_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_one_to_one_invites FROM anon, authenticated;

-- A self-initiated invitation becomes a normal MY121 pair only on acceptance.
-- The function serializes the invitation and creates its own non-Chapter round
-- so schedules, handshake and reflection retain their existing foreign keys.
CREATE OR REPLACE FUNCTION public.respond_member_one_to_one_invite(
  p_invite_id UUID,
  p_actor_member_id UUID,
  p_response TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.member_one_to_one_invites%ROWTYPE;
  v_round_id UUID;
  v_pair_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_invite FROM public.member_one_to_one_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_invite.invitee_member_id <> p_actor_member_id THEN RAISE EXCEPTION 'Only the invited member can respond'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is no longer pending'; END IF;
  IF p_response NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Invalid invitation response'; END IF;

  IF p_response='declined' THEN
    UPDATE public.member_one_to_one_invites SET status='declined',responded_at=v_now,updated_at=v_now WHERE id=v_invite.id;
    INSERT INTO public.one_to_one_status_events(member_id,event_type,actor_type,actor_ref,metadata)
    VALUES(p_actor_member_id,'member_self_121_invite_declined','member',p_actor_member_id::text,jsonb_build_object('inviteId',v_invite.id));
    RETURN jsonb_build_object('inviteId',v_invite.id,'status','declined');
  END IF;

  INSERT INTO public.matching_rounds(meeting_date,source_file_name,matching_type,status,created_by,confirmed_by,confirmed_at,system_version,timezone,feature_flag,journey_type)
  VALUES(current_date,'Member initiated 1-2-1','member_self','sent','member:'||p_actor_member_id::text,'member:'||p_actor_member_id::text,v_now,2,'Asia/Bangkok','one_to_one_system','member_self')
  RETURNING id INTO v_round_id;
  INSERT INTO public.matching_pairs(round_id,position,member_a_id,member_b_id,is_locked,status,match_reason,constraint_notes)
  VALUES(v_round_id,1,v_invite.requester_member_id,v_invite.invitee_member_id,true,'matched','["member_self"]'::jsonb,'["accepted_by_both_members"]'::jsonb)
  RETURNING id INTO v_pair_id;
  UPDATE public.member_one_to_one_invites
  SET status='accepted',accepted_pair_id=v_pair_id,responded_at=v_now,updated_at=v_now WHERE id=v_invite.id;
  INSERT INTO public.one_to_one_status_events(round_id,pair_id,member_id,event_type,actor_type,actor_ref,metadata)
  VALUES(v_round_id,v_pair_id,p_actor_member_id,'member_self_121_invite_accepted','member',p_actor_member_id::text,jsonb_build_object('inviteId',v_invite.id,'requesterMemberId',v_invite.requester_member_id));
  INSERT INTO public.chapter_audit_events(event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES('member_self_121_invite_accepted','member',p_actor_member_id::text,'matching_pair',v_pair_id::text,jsonb_build_object('inviteId',v_invite.id,'journeyType','member_self'));
  RETURN jsonb_build_object('inviteId',v_invite.id,'status','accepted','pairId',v_pair_id,'roundId',v_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_member_one_to_one_invite(UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_member_one_to_one_invite(UUID,UUID,TEXT) TO service_role;

-- Chapter allocation remains one active assigned pair at a time. Voluntary
-- sessions are intentionally excluded: they are an additional relationship,
-- not a replacement for an unfinished Chapter assignment.
CREATE OR REPLACE FUNCTION public.enforce_one_active_one_to_one_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('confirmed','sending','sent','partially_failed')
     OR (TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','sending','sent','partially_failed')) THEN
    RETURN NEW;
  END IF;
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
    JOIN public.matching_rounds candidate_round ON candidate_round.id=candidate.round_id
    JOIN public.matching_pairs existing ON existing.id<>candidate.id
    JOIN public.matching_rounds existing_round ON existing_round.id=existing.round_id
    WHERE candidate.round_id=NEW.id
      AND candidate_round.journey_type='chapter'
      AND existing_round.journey_type='chapter'
      AND candidate.archived_at IS NULL
      AND candidate.status IN ('matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified','overdue','unable_to_contact','missed_appointment')
      AND existing.archived_at IS NULL
      AND existing.status IN ('matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified','overdue','unable_to_contact','missed_appointment')
      AND existing_round.status IN ('confirmed','sending','sent','partially_failed')
      AND ARRAY[candidate.member_a_id,candidate.member_b_id,candidate.optional_member_c_id]
          && ARRAY[existing.member_a_id,existing.member_b_id,existing.optional_member_c_id]
  ) THEN RAISE EXCEPTION 'A member already has an active Chapter 1-2-1 pair'; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.member_one_to_one_invites IS
  'Member-to-member MY121 invitations. No LINE delivery is created automatically; acceptance creates a separate member_self journey.';
