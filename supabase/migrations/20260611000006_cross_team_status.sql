-- Add status column to cross_team_synergy (required by UI update/delete flow)
ALTER TABLE cross_team_synergy
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'in-progress', 'done', 'cancelled'));
