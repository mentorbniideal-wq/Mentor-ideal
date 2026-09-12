-- Phase 2C batch 3: tenant scope for renewal records and their audit trail.
ALTER TABLE public.renewals ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.renewal_events ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
UPDATE public.renewals r SET chapter_id = m.chapter_id FROM public.members m WHERE r.member_id = m.id AND r.chapter_id IS NULL;
UPDATE public.renewal_events e SET chapter_id = r.chapter_id
FROM public.renewals r
WHERE e.renewal_id = r.id AND e.chapter_id IS NULL;
UPDATE public.renewal_events e SET chapter_id = m.chapter_id FROM public.members m WHERE e.member_id = m.id AND e.chapter_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_renewals_chapter_expiry ON public.renewals(chapter_id, expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_renewals_chapter_workflow ON public.renewals(chapter_id, workflow_status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_renewal_events_chapter_member ON public.renewal_events(chapter_id, member_id, created_at DESC);
COMMENT ON COLUMN public.renewals.chapter_id IS 'Phase 2C tenant scope, derived from the renewal member; API must never accept this value from the browser.';
