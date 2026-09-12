-- Phase 2C batch 4: tenant scope for scoring snapshots and score history.
ALTER TABLE public.monthly_scores ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.r2y_stats ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT;
UPDATE public.monthly_scores s SET chapter_id = m.chapter_id FROM public.members m WHERE s.member_id = m.id AND s.chapter_id IS NULL;
UPDATE public.r2y_stats s SET chapter_id = m.chapter_id FROM public.members m WHERE s.member_id = m.id AND s.chapter_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_monthly_scores_chapter_member_period ON public.monthly_scores(chapter_id, member_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_scores_chapter_period ON public.monthly_scores(chapter_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_r2y_stats_chapter_member ON public.r2y_stats(chapter_id, member_id);
COMMENT ON COLUMN public.monthly_scores.chapter_id IS 'Phase 2C tenant scope derived from the member record.';
COMMENT ON COLUMN public.r2y_stats.chapter_id IS 'Phase 2C tenant scope derived from the member record.';
