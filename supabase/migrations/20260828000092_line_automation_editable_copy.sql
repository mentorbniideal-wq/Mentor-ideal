ALTER TABLE public.line_automation_controls
  ADD COLUMN IF NOT EXISTS custom_message TEXT;

COMMENT ON COLUMN public.line_automation_controls.custom_message IS
  'Optional Chapter Admin override. When null/blank, cron uses the code-owned default message.';
