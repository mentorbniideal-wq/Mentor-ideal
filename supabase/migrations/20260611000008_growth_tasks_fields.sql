-- Migration: Add rich fields to growth_tasks for full UI parity
-- Adds priority, task_type, member_name columns so the Growth Task Board
-- can store and display structured data from the frontend.

ALTER TABLE growth_tasks
  ADD COLUMN IF NOT EXISTS priority   TEXT DEFAULT '📋',
  ADD COLUMN IF NOT EXISTS task_type  TEXT DEFAULT 'ทั่วไป',
  ADD COLUMN IF NOT EXISTS member_name TEXT;  -- cached name for display (from members.name)
