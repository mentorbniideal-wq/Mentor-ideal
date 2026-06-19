-- Enable Supabase Realtime for score-related tables
ALTER TABLE members       REPLICA IDENTITY FULL;
ALTER TABLE r2y_stats     REPLICA IDENTITY FULL;
ALTER TABLE monthly_scores REPLICA IDENTITY FULL;
ALTER TABLE core_issues   REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE members;
ALTER PUBLICATION supabase_realtime ADD TABLE r2y_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE monthly_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE core_issues;

-- Enable pg_net for HTTP calls from pg_cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Config table for cron secrets (service_role only — no RLS policy for anon)
CREATE TABLE IF NOT EXISTS cron_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE cron_config ENABLE ROW LEVEL SECURITY;
-- No anon policy: only service_role (Edge Functions) can read

-- Seed: anon key (public-safe) + generated cron secret
-- The cron job uses anon key to call the Edge Function; cron_secret acts as the internal auth token
INSERT INTO cron_config (key, value) VALUES
  ('anon_key',    'sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j'),
  ('edge_url',    'https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/api'),
  ('cron_secret', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- Helper function: HTTP POST to Edge Function (runs as postgres superuser in cron context)
CREATE OR REPLACE FUNCTION call_edge_function(p_action TEXT, p_extra JSONB DEFAULT '{}')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url    TEXT;
  v_key    TEXT;
  v_secret TEXT;
  v_body   JSONB;
BEGIN
  SELECT value INTO v_url    FROM cron_config WHERE key = 'edge_url';
  SELECT value INTO v_key    FROM cron_config WHERE key = 'anon_key';
  SELECT value INTO v_secret FROM cron_config WHERE key = 'cron_secret';

  v_body := jsonb_build_object('action', p_action, 'cron_secret', v_secret) || p_extra;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',       v_key,
      'Authorization','Bearer ' || v_key
    ),
    body    := v_body
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'call_edge_function(%) failed: %', p_action, SQLERRM;
END;
$$;

-- Thursday 7:00AM Bangkok (UTC+7 no DST) = Thursday 00:00 UTC
-- cron: '0 0 * * 4'
SELECT cron.schedule(
  'thursday-line-score-alert',
  '0 0 * * 4',
  $$ SELECT call_edge_function('triggerScoreAlert'); $$
);

-- Wednesday 09:00 UTC (Wed 4PM Bangkok) — weekly prep nudge to mentors
SELECT cron.schedule(
  'wednesday-mentor-nudge',
  '0 9 * * 3',
  $$ SELECT call_edge_function('triggerWednesdayNudge'); $$
);
