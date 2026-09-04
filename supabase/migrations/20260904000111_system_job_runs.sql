-- Durable health ledger for scheduled jobs. Console logs alone are not enough
-- for Chapter Admin to know whether an automation ran or failed.

CREATE TABLE IF NOT EXISTS public.system_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  reason TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_system_job_runs_job_started
  ON public.system_job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_status_started
  ON public.system_job_runs(status, started_at DESC);

ALTER TABLE public.system_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_job_runs FROM anon, authenticated;

COMMENT ON TABLE public.system_job_runs IS
  'Privacy-safe execution ledger for cron health, duration and failures.';
