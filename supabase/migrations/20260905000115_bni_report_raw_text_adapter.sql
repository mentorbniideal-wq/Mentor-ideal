-- Fallback adapter: every text-layer PDF can be converted to reviewable CSV,
-- while only validated structured report types may sync operational data.

ALTER TABLE public.bni_report_import_batches
  DROP CONSTRAINT IF EXISTS bni_report_import_batches_report_type_check;

ALTER TABLE public.bni_report_import_batches
  ADD CONSTRAINT bni_report_import_batches_report_type_check
  CHECK (report_type IN ('chapter_roster','summary_palms','raw_text'));
