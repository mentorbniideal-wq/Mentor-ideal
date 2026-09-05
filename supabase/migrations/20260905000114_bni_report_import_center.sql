-- Auditable, tenant-ready import ledger for BNI Connect reports.
-- Raw PDFs and generated CSV content are intentionally not persisted.

CREATE TABLE IF NOT EXISTS public.bni_report_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK (report_type IN ('chapter_roster','summary_palms')),
  original_file_name TEXT NOT NULL CHECK (char_length(original_file_name) BETWEEN 1 AND 255),
  file_sha256 TEXT NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'previewed'
    CHECK (status IN ('previewed','imported','failed')),
  report_run_at TIMESTAMPTZ,
  period_from DATE,
  period_to DATE,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  matched_rows INTEGER NOT NULL DEFAULT 0 CHECK (matched_rows >= 0),
  unmatched_rows INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_rows >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  historical_only BOOLEAN NOT NULL DEFAULT false,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_summary) = 'object'),
  error_summary TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_at TIMESTAMPTZ,
  UNIQUE(chapter_id, report_type, file_sha256)
);

CREATE INDEX IF NOT EXISTS idx_bni_report_import_batches_recent
  ON public.bni_report_import_batches(chapter_id, created_at DESC);

ALTER TABLE public.bni_report_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bni_report_import_batches FROM anon, authenticated;

COMMENT ON TABLE public.bni_report_import_batches IS
  'Privacy-safe BNI Connect import ledger. Stores hashes and aggregate outcomes, never source PDF or generated CSV bodies.';
