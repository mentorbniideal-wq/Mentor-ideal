-- Migration 026: LINE foundation hardening
-- Secure one-time account linking, webhook idempotency, delivery audit log,
-- and atomic delivery claims used by every LINE sender.

CREATE TABLE IF NOT EXISTS public.line_link_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  used_by_line_user_id  TEXT,
  revoked_at            TIMESTAMPTZ,
  created_by_role       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_link_tokens_member
  ON public.line_link_tokens(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_link_tokens_active
  ON public.line_link_tokens(expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.line_link_tokens IS
  'One-time, short-lived tokens used to securely bind a LINE user ID to a member. '
  'Only SHA-256 token hashes are stored.';

CREATE TABLE IF NOT EXISTS public.line_webhook_events (
  event_id        TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  source_user_id  TEXT,
  message_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  attempts        INTEGER NOT NULL DEFAULT 1,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  last_error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_line_webhook_events_received
  ON public.line_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_webhook_events_failed
  ON public.line_webhook_events(status, received_at DESC)
  WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS public.line_message_deliveries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key      TEXT NOT NULL UNIQUE,
  channel              TEXT NOT NULL CHECK (channel IN ('reply', 'push', 'multicast')),
  recipient_id         TEXT NOT NULL,
  member_id            UUID REFERENCES public.members(id) ON DELETE SET NULL,
  notification_type    TEXT,
  source               TEXT,
  payload_hash         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts             INTEGER NOT NULL DEFAULT 1,
  provider_request_id  TEXT,
  response_status      INTEGER,
  response_body        TEXT,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_line_deliveries_recipient
  ON public.line_message_deliveries(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_deliveries_status
  ON public.line_message_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_deliveries_notification
  ON public.line_message_deliveries(notification_type, created_at DESC);

COMMENT ON TABLE public.line_message_deliveries IS
  'Central LINE send audit trail and idempotency ledger. Message bodies are not stored; '
  'payload_hash is retained for diagnostics without retaining message content.';

ALTER TABLE public.line_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_message_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.line_link_tokens FROM anon, authenticated;
REVOKE ALL ON public.line_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.line_message_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_claim_line_delivery(
  p_idempotency_key   TEXT,
  p_channel           TEXT,
  p_recipient_id      TEXT,
  p_member_id         UUID,
  p_notification_type TEXT,
  p_source            TEXT,
  p_payload_hash      TEXT
)
RETURNS TABLE(delivery_id UUID, should_send BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.line_message_deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.line_message_deliveries (
    idempotency_key, channel, recipient_id, member_id,
    notification_type, source, payload_hash
  )
  VALUES (
    p_idempotency_key, p_channel, p_recipient_id, p_member_id,
    p_notification_type, p_source, p_payload_hash
  )
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, true;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_row
      FROM public.line_message_deliveries
     WHERE idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF (
      v_row.status = 'failed'
      OR (v_row.status = 'pending' AND v_row.updated_at < now() - interval '5 minutes')
    ) AND v_row.attempts < 3 THEN
      UPDATE public.line_message_deliveries
         SET status = 'pending',
             attempts = attempts + 1,
             updated_at = now(),
             last_error = NULL
       WHERE id = v_row.id;
      RETURN QUERY SELECT v_row.id, true;
    ELSE
      RETURN QUERY SELECT v_row.id, false;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fn_claim_line_webhook_event(
  p_event_id       TEXT,
  p_event_type     TEXT,
  p_source_user_id TEXT,
  p_message_id     TEXT,
  p_metadata       JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.line_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.line_webhook_events (
    event_id, event_type, source_user_id, message_id, metadata
  )
  VALUES (
    p_event_id, p_event_type, p_source_user_id, p_message_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_event
      FROM public.line_webhook_events
     WHERE event_id = p_event_id
     FOR UPDATE;

    IF (
      v_event.status = 'failed'
      OR (v_event.status = 'processing' AND v_event.received_at < now() - interval '5 minutes')
    ) AND v_event.attempts < 3 THEN
      UPDATE public.line_webhook_events
         SET status = 'processing',
             attempts = attempts + 1,
             received_at = now(),
             last_error = NULL
       WHERE event_id = p_event_id;
      RETURN true;
    END IF;
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_line_webhook_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_line_webhook_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fn_consume_line_link_token(
  p_token_hash   TEXT,
  p_line_user_id TEXT
)
RETURNS TABLE(member_id UUID, member_name TEXT, nickname TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.line_link_tokens%ROWTYPE;
  v_existing_member UUID;
  v_existing_line TEXT;
BEGIN
  SELECT *
    INTO v_token
    FROM public.line_link_tokens
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND
     OR v_token.used_at IS NOT NULL
     OR v_token.revoked_at IS NOT NULL
     OR v_token.expires_at <= now() THEN
    RETURN;
  END IF;

  SELECT lm.member_id INTO v_existing_member
    FROM public.line_members lm
   WHERE lm.line_user_id = p_line_user_id;

  IF v_existing_member IS NOT NULL AND v_existing_member <> v_token.member_id THEN
    RAISE EXCEPTION 'LINE account is already linked to another member';
  END IF;

  SELECT lm.line_user_id INTO v_existing_line
    FROM public.line_members lm
   WHERE lm.member_id = v_token.member_id
     AND lm.line_user_id <> p_line_user_id
   LIMIT 1;

  IF v_existing_line IS NOT NULL THEN
    RAISE EXCEPTION 'Member is already linked to another LINE account';
  END IF;

  INSERT INTO public.line_members(line_user_id, member_id, registered_at)
  VALUES (p_line_user_id, v_token.member_id, now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET member_id = EXCLUDED.member_id,
        registered_at = EXCLUDED.registered_at;

  UPDATE public.line_link_tokens
     SET used_at = now(),
         used_by_line_user_id = p_line_user_id
   WHERE id = v_token.id;

  DELETE FROM public.line_bot_state
   WHERE line_user_id = p_line_user_id
     AND state_key = 'registration';

  RETURN QUERY
  SELECT m.id, m.name, m.nickname
    FROM public.members m
   WHERE m.id = v_token.member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_consume_line_link_token(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_line_link_token(TEXT, TEXT)
  TO service_role;

-- Canonical scheduler setup. This function is intentionally not invoked by the
-- migration; MC must run setupAllTriggers after the cron-jobs function and
-- CRON_SECRET are configured. Running it removes both legacy scheduler families.
CREATE OR REPLACE FUNCTION public.call_cron_job(job_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_url TEXT;
  v_function_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_api_url FROM public.cron_config WHERE key = 'edge_url';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'cron_secret';
  IF COALESCE(v_api_url, '') = '' OR COALESCE(v_secret, '') = '' THEN
    RAISE EXCEPTION 'cron_config edge_url/cron_secret is not configured';
  END IF;

  v_function_url := regexp_replace(v_api_url, '/api/?$', '/cron-jobs');
  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('job', job_name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.call_cron_job(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_cron_job(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_line_cron_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_legacy_names TEXT[] := ARRAY[
    'thursday-line-score-alert', 'wednesday-mentor-nudge',
    'thursday-checkin-reminder', 'daily-anniversary-check',
    'thursday-post-meeting-prompt', 'friday-weekly-score-push',
    'friday-team-leaderboard', 'friday-chapter-pulse',
    'monday-brief', 'wednesday-121-reminder', 'monthly-recap',
    'thursday-score-push', 'wednesday-nudge', 'friday-reminder',
    'friday-leaderboard', 'daily-121-reminder', 'daily-renewal-push',
    'daily-purge-dismissals', 'daily-mentor-team-alert',
    'line-monday-brief', 'line-wednesday-nudge', 'line-thursday-score',
    'line-friday-recap', 'line-monthly-recap', 'line-mentor-alert',
    'line-121-reminder', 'line-renewal', 'line-purge-dismissals'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pg_cron extension not enabled');
  END IF;

  FOREACH v_name IN ARRAY v_legacy_names LOOP
    BEGIN
      PERFORM cron.unschedule(v_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  PERFORM cron.schedule('line-monday-brief', '0 1 * * 1',
    $job$SELECT public.call_cron_job('mondayMorningBrief');$job$);
  PERFORM cron.schedule('line-wednesday-nudge', '0 11 * * 4',
    $job$SELECT public.call_cron_job('wednesdayNudge');$job$);
  PERFORM cron.schedule('line-thursday-score', '0 0 * * 4',
    $job$SELECT public.call_cron_job('thursdayBotPush');$job$);
  PERFORM cron.schedule('line-friday-recap', '0 6 * * 5',
    $job$SELECT public.call_cron_job('fridayEveningReminder');$job$);
  PERFORM cron.schedule('line-monthly-recap', '0 1 1 * *',
    $job$SELECT public.call_cron_job('monthlyRecap');$job$);
  PERFORM cron.schedule('line-mentor-alert', '0 10 * * *',
    $job$SELECT public.call_cron_job('mentorTeamAlert');$job$);
  -- Wed 18:00 Bangkok: useful planning window without late-night interruption.
  PERFORM cron.schedule('line-121-reminder', '0 11 * * 3',
    $job$SELECT public.call_cron_job('line121AutoReminder');$job$);
  -- Daily 10:00 Bangkok: renewal messages stay inside normal contact hours.
  PERFORM cron.schedule('line-renewal', '0 3 * * *',
    $job$SELECT public.call_cron_job('renewalPush');$job$);
  PERFORM cron.schedule('line-purge-dismissals', '0 17 * * *',
    $job$SELECT public.call_cron_job('purgeExpiredDismissals');$job$);

  RETURN jsonb_build_object(
    'ok', true,
    'results', jsonb_build_array(
      'line-monday-brief', 'line-wednesday-nudge', 'line-thursday-score',
      'line-friday-recap', 'line-monthly-recap', 'line-mentor-alert',
      'line-121-reminder', 'line-renewal', 'line-purge-dismissals'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_line_cron_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_line_cron_jobs() TO service_role;
