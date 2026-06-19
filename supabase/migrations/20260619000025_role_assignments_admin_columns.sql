-- Migration 025: Add admin_sections and admin_edit_access to role_assignments
-- These columns support delegated admin access (non-MC users with specific section permissions)

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS admin_sections    TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_edit_access BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.role_assignments.admin_sections IS
  'Admin Panel sections granted to this account. Empty = no delegated admin access. MC always has full access regardless.';
COMMENT ON COLUMN public.role_assignments.admin_edit_access IS
  'false = view only for delegated admin sections. MC always retains full edit access.';
