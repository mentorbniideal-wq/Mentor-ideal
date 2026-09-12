-- A completed Digital Handshake is authoritative. Schedule actions may still
-- be recorded, but they must never move a completed pair back into an active
-- state. This also repairs any active historical row whose handshake evidence
-- is complete but whose cached matching_pairs.status is stale.

CREATE OR REPLACE FUNCTION public.one_to_one_completed_status(p_pair_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair public.matching_pairs%ROWTYPE;
  v_expected INTEGER;
  v_verified INTEGER;
  v_ends_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_pair FROM public.matching_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_expected := 2 + CASE WHEN v_pair.optional_member_c_id IS NULL THEN 0 ELSE 1 END;
  SELECT count(*), max(verification.verified_partner_code_at)
  INTO v_verified, v_completed_at
  FROM public.one_to_one_verifications verification
  WHERE verification.pair_id = p_pair_id
    AND verification.verified_partner_code_at IS NOT NULL
    AND verification.member_id IN (v_pair.member_a_id, v_pair.member_b_id, v_pair.optional_member_c_id);

  IF v_verified <> v_expected THEN RETURN NULL; END IF;

  SELECT ends_at INTO v_ends_at FROM public.matching_rounds WHERE id = v_pair.round_id;
  RETURN CASE WHEN v_ends_at IS NOT NULL AND v_completed_at > v_ends_at THEN 'late_verified' ELSE 'verified' END;
END;
$$;

REVOKE ALL ON FUNCTION public.one_to_one_completed_status(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guard_completed_one_to_one_pair_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_status TEXT;
BEGIN
  v_completed_status := public.one_to_one_completed_status(NEW.id);
  IF v_completed_status IS NOT NULL THEN
    NEW.status := v_completed_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_completed_one_to_one_pair_status ON public.matching_pairs;
CREATE TRIGGER trg_guard_completed_one_to_one_pair_status
  BEFORE UPDATE OF status ON public.matching_pairs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_completed_one_to_one_pair_status();

CREATE OR REPLACE FUNCTION public.sync_completed_one_to_one_pair_after_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_status TEXT;
BEGIN
  IF NEW.verified_partner_code_at IS NULL THEN RETURN NEW; END IF;
  v_completed_status := public.one_to_one_completed_status(NEW.pair_id);
  IF v_completed_status IS NOT NULL THEN
    UPDATE public.matching_pairs SET status = v_completed_status
    WHERE id = NEW.pair_id AND status IS DISTINCT FROM v_completed_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_completed_one_to_one_pair_after_verification ON public.one_to_one_verifications;
CREATE TRIGGER trg_sync_completed_one_to_one_pair_after_verification
  AFTER INSERT OR UPDATE OF verified_partner_code_at ON public.one_to_one_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_completed_one_to_one_pair_after_verification();

WITH repaired AS (
  UPDATE public.matching_pairs pair
  SET status = public.one_to_one_completed_status(pair.id)
  WHERE pair.archived_at IS NULL
    AND pair.status IN ('matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified','overdue','unable_to_contact','missed_appointment')
    AND public.one_to_one_completed_status(pair.id) IS NOT NULL
  RETURNING pair.id, pair.round_id, pair.status
)
INSERT INTO public.one_to_one_status_events (round_id, pair_id, event_type, actor_type, actor_ref, metadata)
SELECT round_id, id, 'pair_status_reconciled_from_verified_handshake', 'system', 'migration-20260912',
  jsonb_build_object('to_status', status, 'reason', 'completed Digital Handshake was authoritative')
FROM repaired;

COMMENT ON FUNCTION public.one_to_one_completed_status(UUID) IS
  'Returns verified or late_verified only when every current pair participant has a completed Digital Handshake.';
