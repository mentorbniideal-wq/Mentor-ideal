-- Add is_new_member flag to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_new_member BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_members_new ON members(is_new_member) WHERE is_new_member = true;
