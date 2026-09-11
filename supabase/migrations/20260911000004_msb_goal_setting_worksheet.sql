-- Member Goal Setting worksheet alignment.
-- Additive only: existing Blueprint rows retain their current annual plan.
-- monthly_marketing_plan is member-authored planning data, not a Power Team assignment.
-- Tenant note: this extends the existing MSB table; it inherits its current
-- server-authorized access path and must receive chapter_id during Phase 2 backfill.

ALTER TABLE public.member_success_blueprints
  ADD COLUMN IF NOT EXISTS quality_121_target_per_week NUMERIC,
  ADD COLUMN IF NOT EXISTS monthly_marketing_plan JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.member_success_blueprints
  ADD CONSTRAINT member_success_blueprints_quality_121_target_nonnegative
  CHECK (quality_121_target_per_week IS NULL OR quality_121_target_per_week >= 0) NOT VALID;

COMMENT ON COLUMN public.member_success_blueprints.quality_121_target_per_week IS
  'Member-owned weekly Quality 1-2-1 target derived from the annual referral plan; may be adjusted by the member.';
COMMENT ON COLUMN public.member_success_blueprints.monthly_marketing_plan IS
  'Member-owned monthly plan rows: month, season_event, product_service, specific_looking_for. Does not create or assign a Power Team.';
