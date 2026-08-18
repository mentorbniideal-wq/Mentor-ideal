CREATE TABLE public.matching_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), meeting_date DATE NOT NULL,
  source_file_name TEXT, matching_type TEXT NOT NULL DEFAULT 'random', repeat_window_weeks INT NOT NULL DEFAULT 12 CHECK (repeat_window_weeks BETWEEN 0 AND 104),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','sending','sent','partially_failed')),
  version INT NOT NULL DEFAULT 1, created_by TEXT NOT NULL, confirmed_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), confirmed_at TIMESTAMPTZ
);
CREATE TABLE public.matching_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), round_id UUID NOT NULL REFERENCES public.matching_rounds(id) ON DELETE CASCADE, row_number INT NOT NULL,
  first_name_en TEXT, last_name_en TEXT, normalized_name TEXT, substitute_name TEXT, looking_for TEXT, checkin_date DATE, checkin_time TIME,
  matched_member_id UUID REFERENCES public.members(id), import_status TEXT NOT NULL CHECK (import_status IN ('ready','no_line','not_found','ambiguous','substitute','duplicate')),
  validation_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(round_id,row_number)
);
CREATE TABLE public.matching_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), round_id UUID NOT NULL REFERENCES public.matching_rounds(id) ON DELETE CASCADE, position INT NOT NULL,
  member_a_id UUID NOT NULL REFERENCES public.members(id), member_b_id UUID NOT NULL REFERENCES public.members(id), optional_member_c_id UUID REFERENCES public.members(id),
  is_locked BOOLEAN NOT NULL DEFAULT false, previous_match_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(round_id,position),
  CHECK (member_a_id <> member_b_id AND (optional_member_c_id IS NULL OR (optional_member_c_id <> member_a_id AND optional_member_c_id <> member_b_id)))
);
CREATE TABLE public.matching_forbidden_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), member_low_id UUID NOT NULL REFERENCES public.members(id), member_high_id UUID NOT NULL REFERENCES public.members(id), reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(member_low_id::text < member_high_id::text), UNIQUE(member_low_id,member_high_id)
);
ALTER TABLE public.line_message_deliveries ADD COLUMN IF NOT EXISTS matching_round_id UUID REFERENCES public.matching_rounds(id) ON DELETE SET NULL;
ALTER TABLE public.line_message_deliveries ADD COLUMN IF NOT EXISTS matching_pair_id UUID REFERENCES public.matching_pairs(id) ON DELETE SET NULL;
CREATE INDEX idx_matching_pairs_round ON public.matching_pairs(round_id);
CREATE INDEX idx_matching_rounds_date ON public.matching_rounds(meeting_date DESC);
CREATE INDEX idx_line_delivery_matching_round ON public.line_message_deliveries(matching_round_id);
ALTER TABLE public.matching_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_forbidden_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matching_rounds, public.matching_import_rows, public.matching_pairs, public.matching_forbidden_pairs FROM anon, authenticated;
