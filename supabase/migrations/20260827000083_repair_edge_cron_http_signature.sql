-- Keep the cron HTTP helper compatible with the pg_net signature installed
-- on the linked project. Positional parameters avoid extension-schema/name
-- resolution differences reported by plpgsql_check.
CREATE OR REPLACE FUNCTION public.call_edge_function(
  p_action TEXT,
  p_extra JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_secret TEXT;
  v_body JSONB;
BEGIN
  SELECT value INTO v_url FROM public.cron_config WHERE key = 'edge_url';
  SELECT value INTO v_key FROM public.cron_config WHERE key = 'anon_key';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'cron_secret';
  IF NULLIF(v_url, '') IS NULL OR NULLIF(v_key, '') IS NULL THEN
    RAISE WARNING 'call_edge_function(%) skipped: cron_config incomplete', p_action;
    RETURN;
  END IF;
  v_body := jsonb_build_object('action', p_action, 'cron_secret', v_secret) || COALESCE(p_extra, '{}'::JSONB);
  PERFORM net.http_post(
    v_url,
    v_body,
    '{}'::JSONB,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    10000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'call_edge_function(%) failed: %', p_action, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.call_edge_function(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_edge_function(TEXT, JSONB) TO service_role;
