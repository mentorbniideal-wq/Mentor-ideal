ALTER TABLE public.matching_import_rows
  DROP CONSTRAINT IF EXISTS matching_import_rows_import_status_check;
ALTER TABLE public.matching_import_rows
  ADD CONSTRAINT matching_import_rows_import_status_check
  CHECK (import_status IN ('ready','no_line','not_found','ambiguous','substitute','duplicate','excluded'));
