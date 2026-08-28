-- Central source of truth for every scheduled LINE automation.
-- Low-value broad pushes start disabled; targeted/member-care messages stay enabled.

CREATE TABLE IF NOT EXISTS public.line_automation_controls (
  automation_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'operational',
  notification_type TEXT,
  source TEXT NOT NULL DEFAULT 'cron-jobs',
  schedule_label TEXT NOT NULL,
  audience TEXT NOT NULL,
  purpose TEXT NOT NULL,
  importance TEXT NOT NULL CHECK (importance IN ('critical','high','normal','low','system')),
  quota_impact TEXT NOT NULL CHECK (quota_impact IN ('none','low','targeted','medium','high')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  protected BOOLEAN NOT NULL DEFAULT false,
  recommendation TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO public.line_automation_controls
  (automation_key,name,module,notification_type,schedule_label,audience,purpose,importance,quota_impact,enabled,protected,recommendation)
VALUES
  ('mondayMorningBrief','Monday Brief','operational','monday_brief','จันทร์ 08:00','Mentor Co. และสมาชิกทุกคน','ภาพรวมต้นสัปดาห์และข้อความกระตุ้นสมาชิก','low','high',false,false,'ปิดไว้ก่อน: เนื้อหาซ้ำกับหน้า Today และใช้โควตาสูง'),
  ('wednesdayNudge','เตือนประชุมวันศุกร์','operational','nudge','พฤหัส 18:00','สมาชิกที่เปิดรับการเตือน','เตรียม Referral, Visitor และ 1-2-1 ก่อนประชุม','normal','high',true,false,'คงไว้ 1 ครั้งต่อสัปดาห์ แต่ใช้ข้อความสั้น'),
  ('thursdayBotPush','คะแนนและ Action ก่อนประชุม','operational','score','พฤหัส 07:00','สมาชิกทุกคนที่ไม่ปิด Score','คะแนนรายบุคคลและคำแนะนำก่อนประชุม','low','high',false,false,'ปิดไว้ก่อน: ส่งวันเดียวกับ Meeting Reminder และสมาชิกดูสถานะเองได้'),
  ('fridayEveningReminder','สรุปหลังประชุมและ Leaderboard','operational','post_meeting','ศุกร์ 13:00','สมาชิกทุกคน และ Mentor Co.','Follow-up หลังประชุมและสรุปทีม','low','high',false,false,'ปิดไว้ก่อน: เป็นข้อความกว้างและคุณค่าต่อสมาชิกไม่เท่ากัน'),
  ('monthlyRecap','Monthly Recap','operational','monthly_recap','วันที่ 1 เวลา 08:00','Mentor Co.','เตือนให้เปิด Dashboard วางแผนเดือนใหม่','low','low',false,false,'ปิดไว้ก่อน: Dashboard มีข้อมูลครบกว่า'),
  ('mentorTeamAlert','แจ้ง Mentor ดูแลสมาชิกเสี่ยง','member_care','mentor_alert','ทุกวัน 17:00 (ส่งเมื่อข้อมูลเปลี่ยน)','Mentor เจ้าของทีม','แจ้งเฉพาะสมาชิกสีแดง/ดำที่ต้องติดตาม','critical','targeted',true,true,'ข้อความดูแลสมาชิกสำคัญ ระบบกันการส่งซ้ำด้วย snapshot'),
  ('line121AutoReminder','ติดตาม 1-2-1 ที่ค้าง','one_to_one','121_reminder','พุธ 18:00','ผู้มีนัดค้างเกิน 7 วัน','ช่วยปิดวงจร 1-2-1 ที่เกิดขึ้นจริง','high','targeted',true,false,'คงไว้เพราะส่งเฉพาะคนที่มีรายการค้าง'),
  ('renewalPush','แจ้งเตือน Renewal','renewal','renewal','ทุกวัน 10:00 (ส่งตาม milestone)','สมาชิกใกล้หมดอายุ','ป้องกัน Renewal หลุดตามช่วงวันที่สำคัญ','critical','targeted',true,true,'ข้อความสำคัญและส่งเพียง milestone'),
  ('passportLtReminder','เตือนนัด Passport','passport','passport_lt_reminder','ก่อนนัด 2 วัน','LT ผู้รับผิดชอบ','เตือนนัดสมาชิกใหม่ที่มีอยู่จริง','high','targeted',true,false,'คงไว้เพราะเป็นนัดหมายที่ต้องลงมือทำ'),
  ('monthlyPersonalReport','รายงานสมาชิกประจำเดือน','operational','score','วันที่ 1 เวลา 09:00','สมาชิกทุกคน','สรุปคะแนนและเป้าหมายรายบุคคล','normal','high',false,false,'ปิดไว้ก่อนจนยืนยันว่าข้อมูล PALMS อัปเดตก่อนส่ง'),
  ('visitorFollowUpReminder','ติดตามแขกพิเศษ','visitor','visitor_followup','ทุกวัน 08:00 (เมื่อครบ 14 วัน)','ผู้เชิญ Visitor ที่ยัง pending','เตือนติดตาม Visitor ที่ยังไม่ปิดผล','high','targeted',true,false,'คงไว้เพราะส่งเฉพาะเคสที่ยังต้องติดตาม'),
  ('provisionLineExperience','ดูแล Rich Menu และ LIFF','system',NULL,'ตามรอบดูแลระบบ','ระบบ LINE','อัปเดต Rich Menu และประสบการณ์ LINE','system','none',true,true,'งานระบบ ไม่ส่งข้อความหาสมาชิก'),
  ('purgeExpiredDismissals','ล้างสถานะพักแจ้งเตือนที่หมดอายุ','system',NULL,'ทุกวัน 00:00','ระบบ','คืนรายการที่หมดเวลาพักเข้าสู่ Action Center','system','none',true,true,'งานระบบ ไม่ใช้โควตา LINE')
ON CONFLICT (automation_key) DO UPDATE SET
  name=EXCLUDED.name,module=EXCLUDED.module,notification_type=EXCLUDED.notification_type,
  schedule_label=EXCLUDED.schedule_label,audience=EXCLUDED.audience,purpose=EXCLUDED.purpose,
  importance=EXCLUDED.importance,quota_impact=EXCLUDED.quota_impact,protected=EXCLUDED.protected,
  recommendation=EXCLUDED.recommendation;

ALTER TABLE public.line_automation_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_automation_controls FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_line_automation_controls_enabled
  ON public.line_automation_controls(enabled, importance);

