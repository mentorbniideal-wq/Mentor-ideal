-- Chapter Operations Center: term handover, account lifecycle and immutable audit.
-- Additive only; all existing active accounts and LT records remain valid.

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active','suspended','revoked')),
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.lt_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_role_assignments_lifecycle
  ON public.role_assignments(access_status, access_expires_at, term_id);

CREATE TABLE IF NOT EXISTS public.lt_term_handover_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES public.lt_terms(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','not_applicable')),
  note TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(term_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.chapter_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_role TEXT,
  actor_ref TEXT,
  subject_type TEXT,
  subject_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapter_audit_events_created
  ON public.chapter_audit_events(created_at DESC, event_type);

ALTER TABLE public.lt_term_handover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lt_term_handover_items, public.chapter_audit_events FROM anon, authenticated;

INSERT INTO public.lt_term_handover_items(term_id,item_key,category,label)
SELECT t.id, x.item_key, x.category, x.label
FROM public.lt_terms t
CROSS JOIN (VALUES
  ('positions','people','กำหนดผู้รับตำแหน่งครบทุกตำแหน่ง'),
  ('line_ready','accounts','ผู้รับตำแหน่งเชื่อม LINE พร้อมรับงาน'),
  ('mobile_access','accounts','ทีม Mentor ผูก Gmail และ Mentor Mobile'),
  ('open_work','work','ทบทวนและส่งมอบงานสมาชิกที่ยังไม่จบ'),
  ('member_data','data','ตรวจความครบถ้วนของข้อมูลสมาชิก'),
  ('notification_health','system','ตรวจโควตาและข้อความ LINE ที่ส่งไม่สำเร็จ'),
  ('permission_review','security','ตรวจสิทธิ์และวันสิ้นสุดของทีมชุดเดิม'),
  ('handover_meeting','people','ประชุมส่งมอบระหว่างทีมเดิมและทีมใหม่')
) AS x(item_key,category,label)
WHERE t.status IN ('active','draft')
ON CONFLICT(term_id,item_key) DO NOTHING;

COMMENT ON TABLE public.lt_term_handover_items IS
  'Chapter Admin readiness checklist for each LT term; operational facts are still calculated live.';
COMMENT ON TABLE public.chapter_audit_events IS
  'Immutable, privacy-safe audit for cross-module Chapter Admin operations; never stores PIN or message bodies.';
