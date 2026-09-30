-- Add only labelled report values. Existing history remains unchanged; unknown
-- source windows and blank cells must never be inferred as monthly activity.
ALTER TABLE public.member_performance_source_snapshots
  ADD COLUMN attendance_present NUMERIC(14,2),
  ADD COLUMN attendance_absent NUMERIC(14,2),
  ADD COLUMN attendance_late NUMERIC(14,2),
  ADD COLUMN attendance_medical NUMERIC(14,2),
  ADD COLUMN attendance_substitute NUMERIC(14,2),
  ADD COLUMN bni_days NUMERIC(14,2),
  ADD COLUMN reported_points NUMERIC(8,2);
