-- Structured, tenant-scoped records parsed from BNI Connect PDF reports.
-- Source PDFs remain outside the database; records retain only the fields
-- needed for Chapter operations and can be deleted by import batch.

ALTER TABLE public.bni_report_import_batches
  DROP CONSTRAINT IF EXISTS bni_report_import_batches_report_type_check;

ALTER TABLE public.bni_report_import_batches
  ADD CONSTRAINT bni_report_import_batches_report_type_check
  CHECK (report_type IN (
    'chapter_roster', 'summary_palms', 'membership_dues', 'absence',
    'speaker', 'training_gap', 'chapter_visitor',
    'profession_opportunity', 'raw_text'
  ));

CREATE TABLE IF NOT EXISTS public.bni_structured_report_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES public.bni_report_import_batches(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'membership_dues', 'absence', 'speaker', 'training_gap',
    'chapter_visitor', 'profession_opportunity'
  )),
  record_key TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  related_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  occurred_on DATE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  contains_personal_data BOOLEAN NOT NULL DEFAULT false,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chapter_id, batch_id, record_key)
);

CREATE INDEX IF NOT EXISTS idx_bni_structured_records_member
  ON public.bni_structured_report_records(chapter_id, member_id, report_type, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_bni_structured_records_type
  ON public.bni_structured_report_records(chapter_id, report_type, imported_at DESC);

ALTER TABLE public.bni_structured_report_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bni_structured_report_records FROM anon, authenticated;

COMMENT ON TABLE public.bni_structured_report_records IS
  'Service-only structured BNI report snapshots. Tenant scoped, batch traceable, and never stores source PDF bodies.';

COMMENT ON COLUMN public.bni_structured_report_records.contains_personal_data IS
  'True for visitor/contact rows; callers must apply least-privilege redaction before returning payloads.';
