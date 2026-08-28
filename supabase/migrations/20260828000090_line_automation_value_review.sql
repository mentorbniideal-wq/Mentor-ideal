ALTER TABLE public.line_automation_controls
  ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'review' CHECK (decision IN ('keep','limit','disable','system','review')),
  ADD COLUMN IF NOT EXISTS value_score SMALLINT NOT NULL DEFAULT 50 CHECK (value_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS duplicate_group TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_note TEXT;

UPDATE public.line_automation_controls SET decision='disable',value_score=25,duplicate_group='weekly_member_nudge',duplicate_note='ซ้ำกับหน้า Today/เป้าหมาย และสมาชิกเปิดดูสถานะได้เอง' WHERE automation_key='mondayMorningBrief';
UPDATE public.line_automation_controls SET decision='limit',value_score=65,duplicate_group='friday_preparation',duplicate_note='ให้คงเพียงข้อความเตือนก่อนประชุม 1 ครั้งต่อสัปดาห์' WHERE automation_key='wednesdayNudge';
UPDATE public.line_automation_controls SET decision='disable',value_score=30,duplicate_group='friday_preparation',duplicate_note='ส่งวันเดียวกับเตือนประชุม และซ้ำกับคำสั่ง “สถานะ”/หน้า Today' WHERE automation_key='thursdayBotPush';
UPDATE public.line_automation_controls SET decision='disable',value_score=25,duplicate_group='weekly_member_nudge',duplicate_note='เป็นข้อความกว้างหลังประชุมและซ้ำกับ Action Center/การติดตามเฉพาะเรื่อง' WHERE automation_key='fridayEveningReminder';
UPDATE public.line_automation_controls SET decision='disable',value_score=20,duplicate_group='admin_dashboard_summary',duplicate_note='Mentor Co. เปิด Dashboard เพื่อดูข้อมูลที่ละเอียดและใหม่กว่าได้' WHERE automation_key='monthlyRecap';
UPDATE public.line_automation_controls SET decision='keep',value_score=95,duplicate_group=NULL,duplicate_note='ไม่ซ้ำ: ส่งเฉพาะ Mentor เมื่อสมาชิกสีแดง/ดำและข้อมูลเปลี่ยน' WHERE automation_key='mentorTeamAlert';
UPDATE public.line_automation_controls SET decision='keep',value_score=85,duplicate_group=NULL,duplicate_note='ไม่ซ้ำ: ส่งเฉพาะรายการ 1-2-1 ที่ค้างจริง' WHERE automation_key='line121AutoReminder';
UPDATE public.line_automation_controls SET decision='keep',value_score=100,duplicate_group=NULL,duplicate_note='ไม่ซ้ำ: ส่งตาม Renewal milestone และมีผลต่อการรักษาสมาชิก' WHERE automation_key='renewalPush';
UPDATE public.line_automation_controls SET decision='keep',value_score=90,duplicate_group=NULL,duplicate_note='ไม่ซ้ำ: เป็นการเตือนนัดหมายที่มีผู้รับผิดชอบชัดเจน' WHERE automation_key='passportLtReminder';
UPDATE public.line_automation_controls SET decision='disable',value_score=35,duplicate_group='member_score_summary',duplicate_note='ซ้ำกับ Score, คำสั่ง “สถานะ” และข้อมูลใน LIFF' WHERE automation_key='monthlyPersonalReport';
UPDATE public.line_automation_controls SET decision='keep',value_score=85,duplicate_group=NULL,duplicate_note='ไม่ซ้ำ: ส่งเฉพาะ Visitor ที่ยัง pending เมื่อครบ 14 วัน' WHERE automation_key='visitorFollowUpReminder';
UPDATE public.line_automation_controls SET decision='system',value_score=100,duplicate_group=NULL,duplicate_note='ไม่ส่งข้อความและไม่ใช้โควตา LINE' WHERE automation_key IN ('provisionLineExperience','purgeExpiredDismissals');
