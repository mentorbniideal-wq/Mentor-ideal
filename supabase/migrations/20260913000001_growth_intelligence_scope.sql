-- Growth Intelligence Phase 1: scope legacy Growth tracking records to the
-- server-derived Chapter. This is additive; no existing record is deleted.

ALTER TABLE public.growth_referral_groups
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.growth_referral_members
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.growth_tasks
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;

-- Existing installation backfill. Member-linked rows take their actual member
-- scope; legacy prospects and unlinked tasks retain the installed Chapter.
UPDATE public.growth_referral_members r
SET chapter_id = m.chapter_id
FROM public.members m
WHERE r.member_id = m.id AND r.chapter_id IS NULL;

WITH installed AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.growth_referral_groups g SET chapter_id = installed.id
FROM installed WHERE g.chapter_id IS NULL;

UPDATE public.growth_referral_members r
SET chapter_id = g.chapter_id
FROM public.growth_referral_groups g
WHERE r.group_id = g.id AND r.chapter_id IS NULL;

WITH installed AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.growth_tasks t SET chapter_id = m.chapter_id
FROM public.members m
WHERE t.member_id = m.id AND t.chapter_id IS NULL;

WITH installed AS (
  SELECT id FROM public.chapter_profiles WHERE chapter_key = 'bni-ideal' LIMIT 1
)
UPDATE public.growth_tasks t SET chapter_id = installed.id
FROM installed WHERE t.chapter_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_growth_referral_groups_chapter_order
  ON public.growth_referral_groups(chapter_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_growth_referral_members_chapter_group
  ON public.growth_referral_members(chapter_id, group_id, seq_no);
CREATE INDEX IF NOT EXISTS idx_growth_tasks_chapter_status_due
  ON public.growth_tasks(chapter_id, status, due_date)
  WHERE status NOT IN ('completed', 'cancelled');

COMMENT ON COLUMN public.growth_referral_groups.chapter_id IS
  'Tenant scope for legacy Growth Sheet groups; derived server-side during backfill and writes.';
COMMENT ON COLUMN public.growth_referral_members.chapter_id IS
  'Tenant scope for Growth Sheet member/prospect rows; never supplied by browser.';
COMMENT ON COLUMN public.growth_tasks.chapter_id IS
  'Tenant scope for Growth action tracking; derived from authenticated Chapter.';
