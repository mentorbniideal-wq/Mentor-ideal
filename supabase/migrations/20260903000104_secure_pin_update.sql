-- Owner-controlled operational PIN updates.
-- The Edge Function authenticates the Chapter Admin before calling this RPC.

CREATE OR REPLACE FUNCTION public.fn_update_pin(
  p_role TEXT,
  p_new_pin TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roles r WHERE r.role = lower(trim(p_role))
  ) THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'PIN must contain 4 to 8 digits';
  END IF;

  UPDATE public.roles AS r
  SET pin_hash = crypt(p_new_pin, gen_salt('bf')),
      updated_at = now()
  WHERE r.role = lower(trim(p_role));
END;
$$;

COMMENT ON FUNCTION public.fn_update_pin(TEXT, TEXT) IS
  'Updates an operational role PIN. Callable by the service role only; caller authorization is enforced by the API.';

REVOKE ALL ON FUNCTION public.fn_update_pin(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_pin(TEXT, TEXT) TO service_role;
