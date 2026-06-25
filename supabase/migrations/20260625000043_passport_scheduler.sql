-- Passport to Success Scheduler — Phase 1
-- Friday-based new member LT session scheduling.

CREATE TABLE IF NOT EXISTS passport_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key        TEXT UNIQUE,
  week_no             INT NOT NULL CHECK (week_no BETWEEN 1 AND 8),
  title               TEXT NOT NULL,
  description         TEXT,
  lt_role             TEXT NOT NULL,
  default_offset_days INT NOT NULL DEFAULT 0,
  is_required         BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE passport_templates ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE passport_templates DROP CONSTRAINT IF EXISTS passport_templates_week_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_templates_template_key
  ON passport_templates(template_key);

CREATE TABLE IF NOT EXISTS passport_lt_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lt_role              TEXT NOT NULL,
  assigned_member_id   UUID REFERENCES members(id) ON DELETE SET NULL,
  assigned_name        TEXT,
  fallback_member_id   UUID REFERENCES members(id) ON DELETE SET NULL,
  term_start           DATE,
  term_end             DATE,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_lt_role_active
  ON passport_lt_assignments(lt_role)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS passport_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_date     DATE NOT NULL,
  start_friday    DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','paused','cancelled')),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id)
);

CREATE INDEX IF NOT EXISTS idx_passport_enrollments_status
  ON passport_enrollments(status, start_friday);

CREATE TABLE IF NOT EXISTS passport_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id          UUID NOT NULL REFERENCES passport_enrollments(id) ON DELETE CASCADE,
  template_id            UUID REFERENCES passport_templates(id) ON DELETE SET NULL,
  template_key           TEXT,
  member_id              UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_no                INT NOT NULL CHECK (week_no BETWEEN 1 AND 8),
  scheduled_date         DATE NOT NULL,
  original_scheduled_date DATE,
  title                  TEXT NOT NULL,
  description            TEXT,
  lt_role                TEXT NOT NULL,
  assigned_lt_member_id  UUID REFERENCES members(id) ON DELETE SET NULL,
  assigned_lt_name       TEXT,
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled','notified','confirmed','declined','rescheduled','completed','missed')),
  confirmed_at           TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  rescheduled_from       DATE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, template_key)
);

ALTER TABLE passport_sessions ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES passport_templates(id) ON DELETE SET NULL;
ALTER TABLE passport_sessions ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE passport_sessions DROP CONSTRAINT IF EXISTS passport_sessions_enrollment_id_week_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_sessions_enrollment_template_key
  ON passport_sessions(enrollment_id, template_key);

CREATE INDEX IF NOT EXISTS idx_passport_sessions_date
  ON passport_sessions(scheduled_date, status);

CREATE INDEX IF NOT EXISTS idx_passport_sessions_lt
  ON passport_sessions(assigned_lt_member_id, scheduled_date);

CREATE TABLE IF NOT EXISTS passport_session_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES passport_sessions(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  actor       TEXT,
  note        TEXT,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE passport_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_lt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_session_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_passport_templates" ON passport_templates;
CREATE POLICY "service_role_all_passport_templates" ON passport_templates FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_all_passport_lt_assignments" ON passport_lt_assignments;
CREATE POLICY "service_role_all_passport_lt_assignments" ON passport_lt_assignments FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_all_passport_enrollments" ON passport_enrollments;
CREATE POLICY "service_role_all_passport_enrollments" ON passport_enrollments FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_all_passport_sessions" ON passport_sessions;
CREATE POLICY "service_role_all_passport_sessions" ON passport_sessions FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_role_all_passport_session_events" ON passport_session_events;
CREATE POLICY "service_role_all_passport_session_events" ON passport_session_events FOR ALL TO service_role USING (true);

UPDATE passport_templates
SET is_active = false, updated_at = now()
WHERE template_key IS NULL;

INSERT INTO passport_templates (template_key, week_no, title, description, lt_role, default_offset_days, sort_order)
VALUES
  ('w1-president', 1, 'สัปดาห์ที่ 1: การเชิญแขก (Invite Visitor)', 'หัวข้อที่สมาชิกใหม่ควรรู้: เพราะอะไรจึงต้องเชิญแขก, คุณสมบัติของแขกที่ควรเชิญ, วิธีการเชิญแขก, Profile Sheet / GAINS Sheet, และเตรียมการนำเสนอ 30 วินาทีสำหรับสัปดาห์ถัดไป · Sign-off: วาระการประชุมแบบสั้น, บทบาทของ LT, การมีส่วนร่วมกับทีม LT, BNI Code of Ethics, Chapter Traffic Light', 'President', 0, 101),
  ('w1-vice-president', 1, 'สัปดาห์ที่ 1: PALMS และ Traffic Light', 'Sign-off: นโยบายสำคัญของ BNI, PALMS Report แบบสั้น, Members Traffic Lights Report แบบสั้น', 'Vice President', 0, 102),
  ('w2-secretary-treasurer', 2, 'สัปดาห์ที่ 2: การนำเสนอ 30 วินาที', 'หัวข้อที่สมาชิกใหม่ควรรู้: ข้อดีและสิ่งที่ควรพัฒนาจากการนำเสนอ 30 วินาที, โครงสร้างของการนำเสนอ 30 วินาที, ลงตารางเข้าอบรม MSP, การกรอก Top Ten Key Customers · Sign-off: Profile Sheet / GAINS Sheet, meeting fees, Training Schedule, การต่ออายุสมาชิก', 'Secretary/Treasurer', 7, 201),
  ('w2-membership-committee', 2, 'สัปดาห์ที่ 2: Attendance Policy และ Substitute', 'Sign-off: การส่งตัวแทน Substitute, การเตรียมตัวแทนให้พร้อม, นโยบายขาด-ลา-สาย Attendance Policy', 'Membership Committee', 7, 202),
  ('w3-education-coordinator', 3, 'สัปดาห์ที่ 3: รีเฟอรัลที่ดี (Good Referral)', 'หัวข้อที่สมาชิกใหม่ควรรู้: รีเฟอรัลคืออะไร, วิธีหารีเฟอรัลที่ดีให้เพื่อน, วิธีได้รับรีเฟอรัลที่ต้องการ, Written Testimonial, Contact-Sphere · Sign-off: ทำไมต้องให้ Quality Referrals, Quality Referral ให้อย่างไร, ความสำคัญของ Trainings', 'Network Education Coordinator', 14, 301),
  ('w3-lead-visitor-host', 3, 'สัปดาห์ที่ 3: Visitor Host Experience', 'Sign-off: ให้สมาชิกใหม่ทดลองร่วมงานกับ Visitor Hosts Team หนึ่งครั้ง, อธิบายบทบาทก่อน-ระหว่าง-หลังประชุม, แนะนำให้ช่วย VH Team ที่โต๊ะลงทะเบียน', 'Lead Visitor Host', 14, 302),
  ('w4-green-121', 4, 'สัปดาห์ที่ 4: การทำ 1-2-1', 'หัวข้อที่สมาชิกใหม่ควรรู้: ตารางการทำ 1-2-1, วิธีกรอก 1-2-1 Meeting Form (9+3 ข้อ), ทบทวน Profile Sheet, GAINS Sheet, Contact-sphere List, Top Ten Key Customer List · Sign-off: One-to-One ที่ทำอย่างไร, การวางตาราง One-to-One', 'Green Member - 1-2-1', 21, 401),
  ('w4-green-referral', 4, 'สัปดาห์ที่ 4: Referral Best Practice', 'Sign-off: Referral ที่ดีคืออะไร, วิธีการหา Referral จากสมาชิก Green Member ที่โดดเด่นด้านการให้ Referral', 'Green Member - Referral', 21, 402),
  ('w5-green-visitor', 5, 'สัปดาห์ที่ 5: ติดตามผลการทำ 1-2-1', 'หัวข้อที่สมาชิกใหม่ควรรู้: ทำ 1-2-1 เต็มรูปแบบกับ Mentor, ติดตามรีเฟอรัลผ่าน BNI Connect Mobile App, ลงหลักสูตร Advanced MSP · Sign-off: Invitation Mindset, เชิญแขกอย่างไรให้เพิ่มคุณค่าให้สมาชิก, การติดตามแขกก่อนวันประชุม', 'Green Member - Visitor', 28, 501),
  ('w5-event-coordinator', 5, 'สัปดาห์ที่ 5: Event / BOD Awareness', 'Sign-off: อะไรคือ BOD และการเชื่อมโยงกับกิจกรรม Chapter', 'Event Coordinator', 28, 502),
  ('w6-gold-club', 6, 'สัปดาห์ที่ 6: การนำเสนอธุรกิจ 5 นาที', 'หัวข้อที่สมาชิกใหม่ควรรู้: 5 Minutes Presentation คือ Referral Presentation ไม่ใช่ Sales Presentation, โครงสร้างการนำเสนอ 5 นาที · Sign-off: Gold Club Badge, Double Gold Pin และแนวทางการได้รับ badge', 'Gold Club Member', 35, 601),
  ('w6-notable-networker', 6, 'สัปดาห์ที่ 6: Notable Networker', 'Sign-off: คุณประโยชน์ของ Notable Networker Badge และเงื่อนไขการได้รับ Notable Networker of the Month ครบ 3 ครั้งใน 12 เดือน', 'Notable Networker', 35, 602),
  ('w7-growth-coordinator', 7, 'สัปดาห์ที่ 7: Power Team และ Goal Setting', 'หัวข้อที่สมาชิกใหม่ควรรู้: ได้ร่วมประชุม Power Team แล้วหรือยัง, มีการให้หรือรับ referral จาก Power Team แล้วหรือไม่ · Sign-off: Growth Co-ordinator สอนการทำ Member Goal Setting', 'Growth Coordinator', 42, 701),
  ('w8-mentor-coordinator', 8, 'สัปดาห์ที่ 8: Substitute และ Performance Review', 'หัวข้อที่สมาชิกใหม่ควรรู้: ทำไมต้องมี Sub, คุณสมบัติของ Sub, วิธีให้ Sub มาประชุมแทน, ตรวจว่าเข้าอบรม MSP แล้วหรือยัง, ลงทะเบียน The First Year Club · หลังจบ 8 สัปดาห์: ตรวจ Green Member, ประกาศผ่านหลักสูตร, นัด 1-2-1 กับ DNA, เตรียม Performance Review 3 เดือน', 'Mentor Coordinator', 49, 801),
  ('w8-personal-mentor', 8, 'สัปดาห์ที่ 8: Graduation Readiness', 'Sign-off: Personal Mentor ตรวจความพร้อมก่อนจบ Passport, ตรวจ 1-2-1 / MSP / Happiness Survey / แผนต่อ 3 เดือน', 'Personal Mentor', 49, 802)
ON CONFLICT (template_key) DO UPDATE SET
  week_no = EXCLUDED.week_no,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  lt_role = EXCLUDED.lt_role,
  default_offset_days = EXCLUDED.default_offset_days,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Current chapter officer defaults from bni_officers_list.csv.
-- assigned_member_id is resolved at migration time by matching member name or phone.
WITH officer_seed(lt_role, source_role, assigned_name, phone) AS (
  VALUES
    ('President', 'President', 'Jakrapong Visetpanpong', '0819644384'),
    ('Vice President', 'Vice President', 'Suporn Wongchompoo', '0956690406'),
    ('Secretary/Treasurer', 'Secretary / Treasurer', 'Nipawee Supachaisakron', '+66618861888'),
    ('Visitor Host', 'Visitor Host', 'Orapan Pougpralub', '0818729007'),
    ('Lead Visitor Host', 'Visitor Host', 'Orapan Pougpralub', '0818729007'),
    ('Network Education Coordinator', 'Education Coordinator', 'Kanoknat Nakhonthai', '0992698387'),
    ('Education Coordinator', 'Education Coordinator', 'Kanoknat Nakhonthai', '0992698387'),
    ('Event Coordinator', 'Events Coordinator', 'Preyawal Vatcharachaithanin', '0816394245'),
    ('Mentor Coordinator', 'Mentor Coordinator', 'Phitarn Sakulthanaphetch', '0808588987'),
    ('Membership Committee', 'Membership Committee - Community Builder', 'Thanongsak Seriumnuay', '0949289591'),
    ('Growth Coordinator', 'Growth Coordinator', 'Palat Thanasrivanichai', '0815446853'),
    ('Gold Club Member', 'Passport Dynamic Role', 'Gold Club Member', ''),
    ('Notable Networker', 'Passport Dynamic Role', 'Notable Networker', ''),
    ('Chapter Area Director Consultant', 'Chapter Area Director Consultant', 'Wanida Jaruchaikul', '0989945164'),
    ('Chapter Director Consultant', 'Chapter Director Consultant', 'Hataiphan Kongsarppaisal', '0819549953'),
    ('Chapter Ambassador', 'Chapter Ambassador', 'PATTHARWEE THANTHAYANYOUNG', '0979199191')
),
resolved AS (
  SELECT
    s.lt_role,
    s.source_role,
    s.assigned_name,
    s.phone,
    (
      SELECT m.id
      FROM members m
      WHERE regexp_replace(lower(coalesce(m.name, '')), '[^a-z0-9]+', '', 'g')
              = regexp_replace(lower(s.assigned_name), '[^a-z0-9]+', '', 'g')
         OR (
            regexp_replace(coalesce(m.phone, ''), '[^0-9]+', '', 'g')
              = regexp_replace(s.phone, '[^0-9]+', '', 'g')
            AND regexp_replace(s.phone, '[^0-9]+', '', 'g') <> ''
         )
      ORDER BY
        CASE
          WHEN regexp_replace(lower(coalesce(m.name, '')), '[^a-z0-9]+', '', 'g')
                = regexp_replace(lower(s.assigned_name), '[^a-z0-9]+', '', 'g') THEN 0
          ELSE 1
        END,
        m.created_at DESC NULLS LAST
      LIMIT 1
    ) AS member_id
  FROM officer_seed s
),
updated AS (
  UPDATE passport_lt_assignments a
  SET
    assigned_member_id = r.member_id,
    assigned_name = r.assigned_name,
    notes = concat('Seeded from bni_officers_list.csv · ', r.source_role, ' · phone: ', r.phone),
    is_active = true,
    updated_at = now()
  FROM resolved r
  WHERE a.lt_role = r.lt_role
    AND a.is_active = true
  RETURNING a.lt_role
)
INSERT INTO passport_lt_assignments (lt_role, assigned_member_id, assigned_name, notes, is_active)
SELECT
  r.lt_role,
  r.member_id,
  r.assigned_name,
  concat('Seeded from bni_officers_list.csv · ', r.source_role, ' · phone: ', r.phone),
  true
FROM resolved r
WHERE NOT EXISTS (SELECT 1 FROM updated u WHERE u.lt_role = r.lt_role);

COMMENT ON TABLE passport_enrollments IS
  'New member Passport to Success enrollment. start_friday is the Friday on/after joined_date.';

COMMENT ON TABLE passport_sessions IS
  'Friday-based Passport sign-off sessions generated from passport_templates. A week can contain multiple LT/member sign-offs. LINE confirmation will attach here in later phases.';
