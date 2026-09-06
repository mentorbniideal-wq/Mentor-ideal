-- Expand member-initiated work routes without changing existing records.
-- Routing remains server-derived from the active LT term.

ALTER TABLE public.member_signals
  DROP CONSTRAINT IF EXISTS member_signals_signal_type_check;

ALTER TABLE public.member_signals
  ADD CONSTRAINT member_signals_signal_type_check
  CHECK (signal_type IN (
    'goal',
    'visitor',
    'renewal',
    'training',
    'member_help',
    'absence',
    'referral',
    'profile_update',
    'presentation',
    'confidential'
  ));

CREATE INDEX IF NOT EXISTS idx_member_signals_open_route
  ON public.member_signals(signal_type, status, priority, created_at DESC)
  WHERE status IN ('new', 'acknowledged', 'in_progress');

COMMENT ON COLUMN public.member_signals.signal_type IS
  'Server-derived operational route. Help category remains in payload for display/audit.';
