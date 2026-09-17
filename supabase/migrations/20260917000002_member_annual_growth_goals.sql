-- Historical annual BNI revenue goals used for year-over-year Growth planning.
-- Source: IDEAL Power Team & Goal 2026 - Summary.csv
-- SHA-256: 00d068671764b5a2694ea3bbc4648ac3fba412d3ef37fbd81cb006e46dd9ed5c
--
-- This is intentionally separate from current monthly actual revenue and from
-- member-authored Blueprint rows. Exact full-name matching only prevents the
-- nickname collision that previously linked Thanakrit's row to Sumintra.

CREATE TABLE IF NOT EXISTS public.member_annual_growth_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapter_profiles(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_year INTEGER NOT NULL CHECK (goal_year BETWEEN 2020 AND 2100),
  goal_type TEXT NOT NULL DEFAULT 'bni_revenue'
    CHECK (goal_type IN ('bni_revenue')),
  goal_thb NUMERIC(14,2) NOT NULL CHECK (goal_thb >= 0),
  source_file TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_row_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, member_id, goal_year, goal_type)
);

CREATE INDEX IF NOT EXISTS idx_member_annual_growth_goals_chapter_year
  ON public.member_annual_growth_goals(chapter_id, goal_year, member_id);

ALTER TABLE public.member_annual_growth_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_annual_growth_goals FROM anon, authenticated;

COMMENT ON TABLE public.member_annual_growth_goals IS
  'Auditable historical annual Growth goals. Service-only; Chapter scope is derived from the matched member.';

WITH source_rows(source_row_number, raw_name, nickname, goal_thb) AS (
  VALUES
    (3, 'Jirayu Boonlert', 'ฟอร์ด', 4000000.00),
    (4, 'Kanpong Ritchainimit', 'หนึ่ง', 10000000.00),
    (5, 'Nantawat Mahaeknan', 'เน็ท', 3000000.00),
    (6, 'Pariphon Jaroonthiravith', 'ปิงปอง', 5000000.00),
    (7, 'Ploypachcha Tararattanapawn', 'เม', 2000000.00),
    (8, 'Praputsorn Kongsarppaisal', 'แยม', 3000000.00),
    (9, 'Thanongsak Seriumnuay', 'โอ', 3000000.00),
    (10, 'Archara Pagarat', 'นุ่น', 1000000.00),
    (11, 'Jakrapong Visetpanpong', 'อ้น', 2000000.00),
    (12, 'Korranat Worawongthep', 'แพร', 1920000.00),
    (13, 'Naruporn Supittayapornpong', 'เอ๋ย', 2000000.00),
    (14, 'Phitarn Sakulthanaphetch', 'ตูมตาม', 150000.00),
    (15, 'Prakorn Sirimars', 'ไผ่', 1200000.00),
    (16, 'Preeda Noita', 'ตุ๋ย', 20000000.00),
    (17, 'Theerawut Piyaphinthu', 'เบส', 5000000.00),
    (18, 'Thitima Hemarak', 'ปุ๊ก', 12000000.00),
    (19, 'Adisak Pankhot', 'ออฟ', 10000000.00),
    (20, 'Chiranan Sathitsamphan', 'โอ', 500000.00),
    (21, 'Gomen Khotsopa', 'แมน', 480000.00),
    (22, 'Kittathat Jaruchaikul', 'วินโด้', 5000000.00),
    (23, 'Nipawee Supachaisakron', 'แพรว', 1152010.00),
    (24, 'Palat Thanasrivanichai', 'เลียว', 10000000.00),
    (25, 'Phasuthon Taesuwan', 'อะตอม', 2000000.00),
    (26, 'Pongpat Chanthai', 'เขียว', 150000.00),
    (27, 'Rewat Sanpet', 'แอม', 450000.00),
    (28, 'Samrit Pholjan', 'ดราฟ', 900000.00),
    (29, 'Sophon Saenubol', 'พอล', 500000.00),
    (31, 'Yosita Niyomrat', 'ยา', 1200000.00),
    (32, 'Chananan Saengplao', 'แหม่ม', 2000000.00),
    (33, 'Phanupan Somsanook', 'โก้', 1400000.00),
    (34, 'Orapan Pougpralub', 'หมอตู่', 2000000.00),
    (35, 'Ophat Taerattanachai', 'เปเล่', 2000000.00),
    (36, 'Phanuwat Promwong', 'ยศ', 5000000.00),
    (37, 'Suporn Wongchompoo', 'พร', 600000.00),
    (38, 'Pemika Siriyotha', 'มิ้น', 500000.00),
    (39, 'Tanyaluck Treepornwasu', 'จ๊อบ', 3000000.00),
    (40, 'Wasawat Rattanakornpipat', 'ฤทธิ์', 500000.00),
    (41, 'Phannakorn Kittikool', 'ปิุ๊ก', 1000000.00),
    (42, 'Thanakrit Wathport', 'บาย', 5000000.00),
    (43, 'Wisnugorn Udornwong', 'แต้ม', 1000000.00),
    (44, 'Narin Lourujirakul', 'โต้ง', 2000000.00),
    (45, 'Duangkamon Chanthaboon', 'เฟิร์น', 700000.00),
    (46, 'Kanoknat Nakhonthai', 'แนน', 2000000.00),
    (47, 'Itthipol Rattanapirote', 'ฟิว', 1000000.00),
    (48, 'Weerawat Suepadkon', 'หนุ่ม', 1500000.00),
    (49, 'Ekawat Suwannahong', 'ต้น', 1500000.00),
    (50, 'Jetsada Sanudomchok', 'เจษ', 200000.00),
    (51, 'Preyawal Vatcharachaithanin', 'เตย', 1000000.00),
    (52, 'Nilin Waroha', 'ควีน', 300000.00),
    (53, 'Pisit Akarapanichayakul', 'กร', 5000000.00),
    (54, 'Katanchalee Sithiprom', 'ตุ้ย', 1000000.00),
    (56, 'Nattawut Amsri', 'ปลาย', 1500000.00),
    (58, 'Atthachai Somboon', 'อั้น', 120000.00),
    (60, 'Chananphat Punnanitinont', 'ติ๊ก', 5000000.00)
), matched AS (
  SELECT
    m.chapter_id,
    m.id AS member_id,
    s.source_row_number,
    s.goal_thb
  FROM source_rows s
  JOIN public.members m
    ON lower(trim(m.name)) = lower(trim(s.raw_name))
   AND m.is_archived = false
   AND m.chapter_id IS NOT NULL
)
INSERT INTO public.member_annual_growth_goals (
  chapter_id, member_id, goal_year, goal_type, goal_thb,
  source_file, source_sha256, source_row_number
)
SELECT
  chapter_id, member_id, 2026, 'bni_revenue', goal_thb,
  'IDEAL Power Team & Goal 2026 - Summary.csv',
  '00d068671764b5a2694ea3bbc4648ac3fba412d3ef37fbd81cb006e46dd9ed5c',
  source_row_number
FROM matched
ON CONFLICT (chapter_id, member_id, goal_year, goal_type) DO UPDATE SET
  goal_thb = EXCLUDED.goal_thb,
  source_file = EXCLUDED.source_file,
  source_sha256 = EXCLUDED.source_sha256,
  source_row_number = EXCLUDED.source_row_number,
  updated_at = now();

-- Repair the one confirmed legacy nickname collision without guessing a new
-- owner. Thanakrit is not an active member record, so this remains an
-- unlinked historical Growth row instead of appearing under Sumintra.
UPDATE public.growth_referral_members g
SET member_id = NULL,
    updated_at = now()
WHERE lower(trim(g.raw_name)) = 'thanakrit wathport'
  AND EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id = g.member_id
      AND lower(trim(m.name)) = 'sumintra putthakee'
  );
