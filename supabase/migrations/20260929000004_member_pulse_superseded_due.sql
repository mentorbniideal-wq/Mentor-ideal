-- A higher-priority Pulse may replace only an unsent Due campaign.
-- Preserve the older campaign and its audit history instead of deleting it.
ALTER TABLE public.member_pulse_campaigns
  DROP CONSTRAINT IF EXISTS member_pulse_campaigns_status_check;
ALTER TABLE public.member_pulse_campaigns
  ADD CONSTRAINT member_pulse_campaigns_status_check
  CHECK (status IN ('due','sent','opened','in_progress','completed','declined','expired','superseded'));
