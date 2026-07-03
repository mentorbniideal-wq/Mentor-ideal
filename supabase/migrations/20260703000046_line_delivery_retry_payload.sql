-- Store LINE message payload snapshots so failed push/multicast deliveries can
-- be retried from the admin LINE log without guessing the original message.
ALTER TABLE public.line_message_deliveries
  ADD COLUMN IF NOT EXISTS message_payload JSONB;

COMMENT ON COLUMN public.line_message_deliveries.message_payload IS
  'LINE Messaging API messages array snapshot. Used for safe admin retry of failed push/multicast sends.';
