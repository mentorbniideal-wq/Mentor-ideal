-- Add message preview to LINE delivery log so MC can see what was sent
ALTER TABLE public.line_message_deliveries
  ADD COLUMN IF NOT EXISTS message_preview TEXT;

COMMENT ON COLUMN public.line_message_deliveries.message_preview IS
  'First 300 chars of the primary text message body for display in the activity log.';

-- Update fn_claim_line_delivery to accept message_preview
-- Uses DEFAULT NULL so existing 7-arg callers continue to work.
CREATE OR REPLACE FUNCTION public.fn_claim_line_delivery(
  p_idempotency_key   TEXT,
  p_channel           TEXT,
  p_recipient_id      TEXT,
  p_member_id         UUID,
  p_notification_type TEXT,
  p_source            TEXT,
  p_payload_hash      TEXT,
  p_message_preview   TEXT DEFAULT NULL
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
    notification_type, source, payload_hash, message_preview
  )
  VALUES (
    p_idempotency_key, p_channel, p_recipient_id, p_member_id,
    p_notification_type, p_source, p_payload_hash, p_message_preview
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
         SET status   = 'pending',
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

REVOKE ALL ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
