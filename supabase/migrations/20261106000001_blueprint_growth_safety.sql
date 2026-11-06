-- Separate annual Blueprint-to-Growth permission from MY121 partner sharing.
-- No implicit grants/backfill. All writes remain service-only and transactional.
CREATE TABLE public.member_blueprint_growth_consents (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  blueprint_year integer NOT NULL CHECK (blueprint_year BETWEEN 2020 AND 2100),
  chapter_id uuid NOT NULL REFERENCES public.chapter_profiles(id),
  share_referral_focus boolean NOT NULL DEFAULT false,
  share_details boolean NOT NULL DEFAULT false,
  share_business boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id,blueprint_year),
  CHECK (NOT share_details OR share_referral_focus)
);
CREATE TABLE public.growth_write_requests (
  chapter_id uuid NOT NULL REFERENCES public.chapter_profiles(id),
  operation text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chapter_id,operation,request_id)
);
CREATE INDEX member_blueprint_growth_consents_chapter_year ON public.member_blueprint_growth_consents(chapter_id,blueprint_year);
ALTER TABLE public.member_blueprint_growth_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_blueprint_growth_consents,public.growth_write_requests FROM anon,authenticated;
GRANT ALL ON public.member_blueprint_growth_consents,public.growth_write_requests TO service_role;

CREATE FUNCTION public.save_blueprint_growth_atomic(p_chapter_id uuid,p_member_id uuid,p_year integer,p_request_id uuid,p_expected_updated_at timestamptz,p_plan jsonb,p_consent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_plan public.member_success_blueprints; saved public.member_success_blueprints; replay public.growth_write_requests;
  signature text; result jsonb; consent_row public.member_blueprint_growth_consents;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request identity required'; END IF;
  -- Member lock serializes concurrent saves; scope is verified before any replay.
  PERFORM 1 FROM public.members WHERE id=p_member_id AND chapter_id=p_chapter_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member outside active Chapter'; END IF;
  PERFORM 1 FROM public.chapter_profiles WHERE id=p_chapter_id AND msb_planning_year=p_year;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning year changed; reload'; END IF;
  signature:=md5(jsonb_build_object('member',p_member_id,'year',p_year,'plan',p_plan,'consent',p_consent,'expected',p_expected_updated_at)::text);
  SELECT * INTO replay FROM public.growth_write_requests WHERE chapter_id=p_chapter_id AND operation='blueprint' AND request_id=p_request_id;
  IF FOUND THEN
    IF replay.payload_hash<>signature THEN RAISE EXCEPTION 'Request identity reused with different content'; END IF;
    RETURN replay.result;
  END IF;
  SELECT * INTO old_plan FROM public.member_success_blueprints WHERE member_id=p_member_id AND blueprint_year=p_year FOR UPDATE;
  IF FOUND AND old_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Blueprint changed; reload before saving'; END IF;
  saved:=jsonb_populate_record(NULL::public.member_success_blueprints,p_plan||jsonb_build_object('id',coalesce(old_plan.id,gen_random_uuid()),'member_id',p_member_id,'blueprint_year',p_year,'created_at',coalesce(old_plan.created_at,now()),'updated_at',now()));
  INSERT INTO public.member_success_blueprints(id,member_id,blueprint_year,total_sales_target_year,expected_sales_from_bni_year,existing_customer_revenue_from_bni,new_customer_revenue_from_bni,average_customer_value_year,conversion_rate_percent,bni_contribution_percent,customer_needed,referral_needed,referral_per_month,referral_per_week,calculated_at,looking_for_categories,looking_for_detail,power_team_categories,power_team_detail,personal_goal_category,personal_goal_detail,status,source,created_at,updated_at,quality_121_target_per_week,monthly_marketing_plan)
  VALUES(saved.id,saved.member_id,saved.blueprint_year,saved.total_sales_target_year,saved.expected_sales_from_bni_year,saved.existing_customer_revenue_from_bni,saved.new_customer_revenue_from_bni,saved.average_customer_value_year,saved.conversion_rate_percent,saved.bni_contribution_percent,saved.customer_needed,saved.referral_needed,saved.referral_per_month,saved.referral_per_week,saved.calculated_at,saved.looking_for_categories,saved.looking_for_detail,saved.power_team_categories,saved.power_team_detail,saved.personal_goal_category,saved.personal_goal_detail,saved.status,saved.source,saved.created_at,saved.updated_at,saved.quality_121_target_per_week,saved.monthly_marketing_plan)
  ON CONFLICT(member_id,blueprint_year) DO UPDATE SET
    total_sales_target_year=EXCLUDED.total_sales_target_year,expected_sales_from_bni_year=EXCLUDED.expected_sales_from_bni_year,
    existing_customer_revenue_from_bni=EXCLUDED.existing_customer_revenue_from_bni,new_customer_revenue_from_bni=EXCLUDED.new_customer_revenue_from_bni,
    average_customer_value_year=EXCLUDED.average_customer_value_year,conversion_rate_percent=EXCLUDED.conversion_rate_percent,
    bni_contribution_percent=EXCLUDED.bni_contribution_percent,customer_needed=EXCLUDED.customer_needed,referral_needed=EXCLUDED.referral_needed,
    referral_per_month=EXCLUDED.referral_per_month,referral_per_week=EXCLUDED.referral_per_week,calculated_at=EXCLUDED.calculated_at,
    quality_121_target_per_week=EXCLUDED.quality_121_target_per_week,monthly_marketing_plan=EXCLUDED.monthly_marketing_plan,
    looking_for_categories=EXCLUDED.looking_for_categories,looking_for_detail=EXCLUDED.looking_for_detail,
    power_team_categories=EXCLUDED.power_team_categories,power_team_detail=EXCLUDED.power_team_detail,
    personal_goal_category=EXCLUDED.personal_goal_category,personal_goal_detail=EXCLUDED.personal_goal_detail,
    status=EXCLUDED.status,source=EXCLUDED.source,updated_at=EXCLUDED.updated_at RETURNING * INTO saved;
  -- Missing consent means preserve previous choices, never infer permission.
  IF p_consent IS NOT NULL AND p_consent<>'null'::jsonb THEN
    IF jsonb_typeof(p_consent)<>'object' THEN RAISE EXCEPTION 'Invalid consent'; END IF;
    SELECT * INTO consent_row FROM public.member_blueprint_growth_consents WHERE member_id=p_member_id AND blueprint_year=p_year;
    IF consent_row.chapter_id IS NOT NULL AND consent_row.chapter_id<>p_chapter_id THEN RAISE EXCEPTION 'Consent transfer requires explicit Chapter review'; END IF;
    IF consent_row.updated_at IS DISTINCT FROM (p_consent->>'_expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'Sharing choices changed; reload'; END IF;
    INSERT INTO public.member_blueprint_growth_consents(member_id,blueprint_year,chapter_id,share_referral_focus,share_details,share_business)
    VALUES(p_member_id,p_year,p_chapter_id,(p_consent->>'share_referral_focus')::boolean,(p_consent->>'share_details')::boolean,(p_consent->>'share_business')::boolean)
    ON CONFLICT(member_id,blueprint_year) DO UPDATE SET share_referral_focus=EXCLUDED.share_referral_focus,share_details=EXCLUDED.share_details,share_business=EXCLUDED.share_business,updated_at=now();
  END IF;
  IF saved.status='submitted' THEN UPDATE public.members SET bni_goal=saved.expected_sales_from_bni_year WHERE id=p_member_id AND chapter_id=p_chapter_id; END IF;
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(p_chapter_id,'blueprint_saved','member',p_member_id::text,'blueprint',saved.id::text,jsonb_build_object('year',p_year,'request_id',p_request_id,'consent_changed',p_consent IS NOT NULL));
  SELECT * INTO consent_row FROM public.member_blueprint_growth_consents WHERE member_id=p_member_id AND blueprint_year=p_year;
  result:=jsonb_build_object('blueprint',to_jsonb(saved),'growthConsent',to_jsonb(consent_row));
  INSERT INTO public.growth_write_requests VALUES(p_chapter_id,'blueprint',p_request_id,signature,result,now());
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_blueprint_growth_atomic(uuid,uuid,integer,uuid,timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_blueprint_growth_atomic(uuid,uuid,integer,uuid,timestamptz,jsonb,jsonb) TO service_role;

-- Permission can always be withdrawn independently of worksheet completion.
CREATE FUNCTION public.save_blueprint_growth_consent(p_chapter_id uuid,p_member_id uuid,p_year integer,p_request_id uuid,p_consent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_consent public.member_blueprint_growth_consents; replay public.growth_write_requests; signature text; result jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request identity required'; END IF;
  PERFORM 1 FROM public.members WHERE id=p_member_id AND chapter_id=p_chapter_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member outside active Chapter'; END IF;
  PERFORM 1 FROM public.chapter_profiles WHERE id=p_chapter_id AND msb_planning_year=p_year;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning year changed; reload'; END IF;
  signature:=md5(jsonb_build_object('member',p_member_id,'year',p_year,'consent',p_consent)::text);
  SELECT * INTO replay FROM public.growth_write_requests WHERE chapter_id=p_chapter_id AND operation='blueprint_consent' AND request_id=p_request_id;
  IF FOUND THEN
    IF replay.payload_hash<>signature THEN RAISE EXCEPTION 'Request identity reused with different content'; END IF;
    RETURN replay.result;
  END IF;
  SELECT * INTO current_consent FROM public.member_blueprint_growth_consents WHERE member_id=p_member_id AND blueprint_year=p_year;
  IF current_consent.chapter_id IS NOT NULL AND current_consent.chapter_id<>p_chapter_id THEN RAISE EXCEPTION 'Consent transfer requires explicit Chapter review'; END IF;
  IF current_consent.updated_at IS DISTINCT FROM (p_consent->>'_expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'Sharing choices changed; reload'; END IF;
  IF current_consent.member_id IS NOT NULL AND current_consent.share_referral_focus=(p_consent->>'share_referral_focus')::boolean AND current_consent.share_details=(p_consent->>'share_details')::boolean AND current_consent.share_business=(p_consent->>'share_business')::boolean THEN
    result:=to_jsonb(current_consent);
    INSERT INTO public.growth_write_requests VALUES(p_chapter_id,'blueprint_consent',p_request_id,signature,result,now());
    RETURN result;
  END IF;
  INSERT INTO public.member_blueprint_growth_consents(member_id,blueprint_year,chapter_id,share_referral_focus,share_details,share_business)
  VALUES(p_member_id,p_year,p_chapter_id,(p_consent->>'share_referral_focus')::boolean,(p_consent->>'share_details')::boolean,(p_consent->>'share_business')::boolean)
  ON CONFLICT(member_id,blueprint_year) DO UPDATE SET share_referral_focus=EXCLUDED.share_referral_focus,share_details=EXCLUDED.share_details,share_business=EXCLUDED.share_business,updated_at=clock_timestamp() RETURNING * INTO current_consent;
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(p_chapter_id,'blueprint_sharing_changed','member',p_member_id::text,'blueprint_consent',p_member_id::text,jsonb_build_object('year',p_year,'request_id',p_request_id,'share_categories',current_consent.share_referral_focus,'share_details',current_consent.share_details,'share_business',current_consent.share_business));
  result:=to_jsonb(current_consent);
  INSERT INTO public.growth_write_requests VALUES(p_chapter_id,'blueprint_consent',p_request_id,signature,result,now());
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_blueprint_growth_consent(uuid,uuid,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_blueprint_growth_consent(uuid,uuid,integer,uuid,jsonb) TO service_role;

ALTER TABLE public.power_team_proposals ADD COLUMN blueprint_year integer;
ALTER TABLE public.power_team_proposals ADD COLUMN leader_member_id uuid REFERENCES public.members(id);
ALTER TABLE public.power_team_proposals ADD COLUMN supersedes_publication_id uuid REFERENCES public.growth_power_team_publications(id);
ALTER TABLE public.power_team_proposal_members ADD COLUMN participation_status text CHECK (participation_status IN ('invited','accepted','declined'));
ALTER TABLE public.power_team_proposal_members ADD COLUMN responded_at timestamptz;
-- New Proposals have an annual context; existing historical rows remain NULL.
CREATE FUNCTION public.create_power_team_proposal_atomic(p_chapter_id uuid,p_request_id uuid,p_actor text,p_data jsonb,p_members uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member_count integer; proposal uuid; signature text; replay public.growth_write_requests; result jsonb; planning_year integer;
BEGIN
  IF p_request_id IS NULL OR coalesce(p_actor,'')='' THEN RAISE EXCEPTION 'Request identity and actor required'; END IF;
  -- Serializes request keys across different simultaneous proposal payloads.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chapter_id::text||':proposal:'||p_request_id::text,0));
  signature:=md5(jsonb_build_object('actor',p_actor,'data',p_data,'members',to_jsonb(p_members))::text);
  SELECT * INTO replay FROM public.growth_write_requests WHERE chapter_id=p_chapter_id AND operation='proposal' AND request_id=p_request_id;
  IF FOUND THEN
    IF replay.payload_hash<>signature THEN RAISE EXCEPTION 'Request identity reused with different content'; END IF;
    RETURN replay.result;
  END IF;
  SELECT msb_planning_year INTO planning_year FROM public.chapter_profiles WHERE id=p_chapter_id;
  IF planning_year IS NULL THEN RAISE EXCEPTION 'Chapter planning year required'; END IF;
  IF coalesce(cardinality(p_members),0)<2 OR cardinality(p_members)>200 THEN RAISE EXCEPTION 'Choose between 2 and 200 members'; END IF;
  PERFORM id FROM public.members WHERE id=ANY(p_members) AND chapter_id=p_chapter_id AND NOT is_archived ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS member_count=ROW_COUNT;
  IF member_count<>cardinality(p_members) THEN RAISE EXCEPTION 'Members must be unique, active and in the same Chapter'; END IF;
  IF nullif(p_data->>'leaderMemberId','') IS NOT NULL AND NOT ((p_data->>'leaderMemberId')::uuid=ANY(p_members)) THEN RAISE EXCEPTION 'Team coordinator must be a selected member'; END IF;
  IF p_data->>'supersedesPublicationId' IS NOT NULL THEN
    PERFORM 1 FROM public.growth_power_team_publications WHERE id=(p_data->>'supersedesPublicationId')::uuid AND chapter_id=p_chapter_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Previous publication outside Chapter'; END IF;
  END IF;
  INSERT INTO public.power_team_proposals(chapter_id,title,target_customer_group,rationale,source_category,created_by,blueprint_year,supersedes_publication_id,leader_member_id,status)
  VALUES(p_chapter_id,p_data->>'title',p_data->>'targetCustomerGroup',p_data->>'rationale',nullif(p_data->>'sourceCategory',''),p_actor,planning_year,(p_data->>'supersedesPublicationId')::uuid,nullif(p_data->>'leaderMemberId','')::uuid,'draft') RETURNING id INTO proposal;
  INSERT INTO public.power_team_proposal_members(proposal_id,member_id,participation_status) SELECT proposal,unnest(p_members),'invited';
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(p_chapter_id,'power_team_proposal_created','coordinator',p_actor,'proposal',proposal::text,jsonb_build_object('request_id',p_request_id,'member_count',member_count));
  result:=jsonb_build_object('proposalId',proposal);
  INSERT INTO public.growth_write_requests VALUES(p_chapter_id,'proposal',p_request_id,signature,result,now());
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_power_team_proposal_atomic(uuid,uuid,text,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_power_team_proposal_atomic(uuid,uuid,text,jsonb,uuid[]) TO service_role;

-- A new reviewed publication may supersede a previous version. History stays
-- immutable; retiring the old version and publishing the new one are atomic.
CREATE FUNCTION public.retire_superseded_power_team() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE previous_id uuid;
BEGIN
  SELECT supersedes_publication_id INTO previous_id FROM public.power_team_proposals WHERE id=NEW.proposal_id;
  IF previous_id IS NOT NULL THEN
    PERFORM 1 FROM public.growth_power_team_publications WHERE id=previous_id AND chapter_id=NEW.chapter_id AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Previous team version is no longer active'; END IF;
    UPDATE public.growth_power_team_publications SET status='archived',archived_at=now(),archived_by_email=NEW.published_by_email WHERE id=previous_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_retire_superseded_power_team AFTER INSERT ON public.growth_power_team_publications FOR EACH ROW EXECUTE FUNCTION public.retire_superseded_power_team();

CREATE FUNCTION public.guard_power_team_participation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.power_team_proposals WHERE id=NEW.proposal_id AND blueprint_year IS NOT NULL) AND
     EXISTS(SELECT 1 FROM public.power_team_proposal_members WHERE proposal_id=NEW.proposal_id AND participation_status IS DISTINCT FROM 'accepted') THEN
    RAISE EXCEPTION 'Every invited member must accept before publication';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_power_team_participation BEFORE INSERT ON public.growth_power_team_publications FOR EACH ROW EXECUTE FUNCTION public.guard_power_team_participation();

CREATE FUNCTION public.respond_power_team_invitation(p_chapter_id uuid,p_member_id uuid,p_proposal_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_status text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Invalid participation status'; END IF;
  PERFORM 1 FROM public.members WHERE id=p_member_id AND chapter_id=p_chapter_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member outside active Chapter'; END IF;
  PERFORM 1 FROM public.power_team_proposals WHERE id=p_proposal_id AND chapter_id=p_chapter_id AND status IN ('draft','assigned','exploring','active') FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.growth_power_team_publications WHERE proposal_id=p_proposal_id) THEN RAISE EXCEPTION 'Proposal is no longer open for responses'; END IF;
  SELECT participation_status INTO old_status FROM public.power_team_proposal_members WHERE proposal_id=p_proposal_id AND member_id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not invited to this Proposal'; END IF;
  IF old_status=p_status THEN RETURN; END IF;
  UPDATE public.power_team_proposal_members SET participation_status=p_status,responded_at=now() WHERE proposal_id=p_proposal_id AND member_id=p_member_id;
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(p_chapter_id,'power_team_participation','member',p_member_id::text,'proposal',p_proposal_id::text,jsonb_build_object('status',p_status));
END $$;
REVOKE ALL ON FUNCTION public.respond_power_team_invitation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_power_team_invitation(uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.update_power_team_proposal_atomic(p_chapter_id uuid,p_proposal_id uuid,p_expected_updated_at timestamptz,p_actor text,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.power_team_proposals; patch jsonb;
BEGIN
  SELECT * INTO previous FROM public.power_team_proposals WHERE id=p_proposal_id AND chapter_id=p_chapter_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal outside Chapter'; END IF;
  IF EXISTS(SELECT 1 FROM public.growth_power_team_publications WHERE proposal_id=p_proposal_id) THEN RAISE EXCEPTION 'Published Proposal is immutable'; END IF;
  patch:=p_patch-'updated_at';
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN ('status','rationale','assigned_owner_email','assigned_owner_name','assigned_at')) THEN RAISE EXCEPTION 'Invalid Proposal change'; END IF;
  IF to_jsonb(previous) @> (patch-'assigned_at') THEN RETURN; END IF;
  IF previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Proposal changed; reload'; END IF;
  IF patch ? 'assigned_owner_email' THEN
    PERFORM 1 FROM public.role_assignments WHERE chapter_id=p_chapter_id AND lower(email)=lower(patch->>'assigned_owner_email') AND role='growth' AND access_status='active'
      AND (access_starts_at IS NULL OR access_starts_at<=now()) AND (access_expires_at IS NULL OR access_expires_at>now()) AND (read_only_after IS NULL OR read_only_after>now());
    IF NOT FOUND THEN RAISE EXCEPTION 'Growth owner is no longer active in this Chapter'; END IF;
  END IF;
  UPDATE public.power_team_proposals SET status=coalesce(patch->>'status',status),rationale=coalesce(patch->>'rationale',rationale),
    assigned_owner_email=coalesce(patch->>'assigned_owner_email',assigned_owner_email),assigned_owner_name=coalesce(patch->>'assigned_owner_name',assigned_owner_name),
    assigned_at=coalesce((patch->>'assigned_at')::timestamptz,assigned_at),updated_at=clock_timestamp() WHERE id=p_proposal_id;
  INSERT INTO public.chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
  VALUES(p_chapter_id,'power_team_proposal_updated','coordinator',p_actor,'proposal',p_proposal_id::text,jsonb_build_object('previous_status',previous.status,'new_status',patch->>'status'));
END $$;
REVOKE ALL ON FUNCTION public.update_power_team_proposal_atomic(uuid,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_power_team_proposal_atomic(uuid,uuid,timestamptz,text,jsonb) TO service_role;
