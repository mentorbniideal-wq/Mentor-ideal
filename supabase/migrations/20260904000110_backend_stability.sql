-- Backend stability follow-up.
-- jsonb_build_object is STABLE in PostgreSQL, therefore fn_palms_score must not
-- be advertised as IMMUTABLE. This changes planner metadata only; the PALMS
-- formula and every score remain unchanged.

ALTER FUNCTION public.fn_palms_score(
  INT, INT, INT, INT, INT, INT, INT, INT, INT, NUMERIC, NUMERIC
) STABLE;
