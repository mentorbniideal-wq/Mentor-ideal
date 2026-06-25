-- Migration 027: LINE AI Copilot and product analytics.

CREATE TABLE IF NOT EXISTS public.line_product_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name     TEXT NOT NULL,
  line_user_id   TEXT,
  member_id      UUID REFERENCES public.members(id) ON DELETE SET NULL,
  role           TEXT,
  source         TEXT NOT NULL DEFAULT 'line',
  properties     JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_product_events_name_time
  ON public.line_product_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_product_events_member_time
  ON public.line_product_events(member_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_copilot_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID REFERENCES public.members(id) ON DELETE SET NULL,
  line_user_id     TEXT,
  actor_role       TEXT NOT NULL,
  source           TEXT NOT NULL,
  prompt_hash      TEXT NOT NULL,
  intent           TEXT,
  model            TEXT,
  status           TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'blocked')),
  latency_ms       INTEGER,
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  safety_flags     JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_runs_created
  ON public.ai_copilot_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_copilot_runs_role
  ON public.ai_copilot_runs(actor_role, created_at DESC);

ALTER TABLE public.line_product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_copilot_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_product_events FROM anon, authenticated;
REVOKE ALL ON public.ai_copilot_runs FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_line_product_metrics AS
SELECT
  date_trunc('day', occurred_at AT TIME ZONE 'Asia/Bangkok')::date AS event_date,
  event_name,
  source,
  count(*)::bigint AS event_count,
  count(DISTINCT member_id)::bigint AS unique_members
FROM public.line_product_events
GROUP BY 1, 2, 3;

REVOKE ALL ON public.v_line_product_metrics FROM anon, authenticated;
GRANT SELECT ON public.v_line_product_metrics TO service_role;

