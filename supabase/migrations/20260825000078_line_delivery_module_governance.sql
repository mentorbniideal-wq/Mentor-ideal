-- Major Upgrade Phase 5: make every unified LINE delivery attributable to a
-- module/category/priority so quotas and suppression reports are trustworthy.

INSERT INTO public.notification_budget_config(module, monthly_hard_cap, target_min, target_max, daily_member_cap, weekly_reminder_cap, cooldown_hours)
VALUES
  ('operational', 4000, 0, 1500, 2, 3, 12),
  ('visitor', 1200, 0, 500, 2, 2, 12),
  ('renewal', 1200, 0, 500, 1, 2, 24),
  ('training', 1200, 0, 500, 1, 2, 24),
  ('goal', 800, 0, 300, 1, 2, 24),
  ('member_help', 800, 0, 300, 2, 3, 8)
ON CONFLICT (module) DO NOTHING;

DROP FUNCTION IF EXISTS public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.fn_claim_line_delivery(
  p_idempotency_key TEXT,
  p_channel TEXT,
  p_recipient_id TEXT,
  p_member_id UUID,
  p_notification_type TEXT,
  p_source TEXT,
  p_payload_hash TEXT,
  p_message_preview TEXT,
  p_module TEXT,
  p_category TEXT,
  p_priority TEXT
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
    notification_type, source, payload_hash, message_preview,
    module, category, priority
  ) VALUES (
    p_idempotency_key, p_channel, p_recipient_id, p_member_id,
    p_notification_type, p_source, p_payload_hash, p_message_preview,
    COALESCE(NULLIF(p_module, ''), 'operational'),
    COALESCE(NULLIF(p_category, ''), p_notification_type),
    COALESCE(NULLIF(p_priority, ''), 'informational')
  ) RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, true;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_row FROM public.line_message_deliveries
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF (v_row.status = 'failed' OR (v_row.status = 'pending' AND v_row.updated_at < now() - interval '5 minutes'))
     AND v_row.attempts < 3 THEN
    UPDATE public.line_message_deliveries SET status = 'pending', attempts = attempts + 1,
      updated_at = now(), last_error = NULL WHERE id = v_row.id;
    RETURN QUERY SELECT v_row.id, true;
  END IF;
  RETURN QUERY SELECT v_row.id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_line_delivery(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
