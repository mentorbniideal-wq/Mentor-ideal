-- Enhance new_member_checklist for full 41-task program support
ALTER TABLE new_member_checklist
  ADD COLUMN IF NOT EXISTS pass                BOOLEAN,
  ADD COLUMN IF NOT EXISTS nopass              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mentor_comment      TEXT,
  ADD COLUMN IF NOT EXISTS lead_mentor_comment TEXT;

-- Rename is_done → keep for backward compat, but pass supersedes it
-- When pass=true, is_done=true. When nopass=true, is_done=false.
