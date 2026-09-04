-- Odd 1-2-1 pools may use one exceptional group of three so every eligible
-- attendee receives a match. Normal groups remain pairs of two.

CREATE OR REPLACE FUNCTION public.enforce_two_or_three_member_new_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_version SMALLINT;
BEGIN
  SELECT system_version INTO v_version
  FROM public.matching_rounds
  WHERE id = NEW.round_id;

  IF COALESCE(v_version, 1) >= 2
     AND (NEW.member_a_id = NEW.member_b_id
       OR NEW.member_a_id = NEW.optional_member_c_id
       OR NEW.member_b_id = NEW.optional_member_c_id) THEN
    RAISE EXCEPTION 'A 1-2-1 group cannot contain the same member twice';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_two_member_new_pair ON public.matching_pairs;
DROP TRIGGER IF EXISTS trg_enforce_two_or_three_member_new_pair ON public.matching_pairs;
CREATE TRIGGER trg_enforce_two_or_three_member_new_pair
BEFORE INSERT OR UPDATE ON public.matching_pairs
FOR EACH ROW EXECUTE FUNCTION public.enforce_two_or_three_member_new_pair();

COMMENT ON COLUMN public.matching_pairs.optional_member_c_id IS
  'Third member used only for the single exceptional trio created from an odd eligible pool.';
