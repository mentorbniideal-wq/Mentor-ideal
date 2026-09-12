-- Remember unambiguous CSV-name resolutions so MC does not need to repeat work.
-- This is installation-scoped until the planned chapter_id migration; it has no
-- client access and every write is performed by the server-side MC workflow.
CREATE TABLE IF NOT EXISTS public.one_to_one_member_name_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 240),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  first_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_count INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_count > 0),
  last_confirmed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name)
);

ALTER TABLE public.one_to_one_member_name_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.one_to_one_member_name_aliases FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_121_name_aliases_member ON public.one_to_one_member_name_aliases(member_id);

-- Backfill only aliases whose complete historical evidence points to one active
-- member. Conflicting names deliberately remain unresolved for human review.
INSERT INTO public.one_to_one_member_name_aliases
  (normalized_name, member_id, first_confirmed_at, last_confirmed_at, confirmation_count, last_confirmed_by)
SELECT r.normalized_name, min(r.matched_member_id), min(r.created_at), max(r.created_at), count(*), 'historical backfill'
FROM public.matching_import_rows r
JOIN public.members m ON m.id = r.matched_member_id
WHERE r.matched_member_id IS NOT NULL
  AND r.import_status IN ('ready', 'no_line')
  AND coalesce(m.is_archived, false) = false
  AND char_length(coalesce(r.normalized_name, '')) BETWEEN 1 AND 240
GROUP BY r.normalized_name
HAVING count(DISTINCT r.matched_member_id) = 1
ON CONFLICT (normalized_name) DO NOTHING;

COMMENT ON TABLE public.one_to_one_member_name_aliases IS
  'Conservative, auditable aliases for recurring Weekly 1-2-1 CSV names. Conflicting aliases are never auto-resolved.';
