-- Member-initiated MY121 help requests must be safe to retry on unstable mobile networks.
ALTER TABLE public.one_to_one_attention_items
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_121_attention_idempotency
  ON public.one_to_one_attention_items(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.one_to_one_attention_items.idempotency_key IS
  'Client action key used to prevent duplicate member-initiated help requests.';
