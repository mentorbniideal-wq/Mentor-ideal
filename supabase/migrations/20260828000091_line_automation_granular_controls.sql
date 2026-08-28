ALTER TABLE public.line_automation_controls
  ADD COLUMN IF NOT EXISTS delivery_kind TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (delivery_kind IN ('scheduled','event','manual','system'));

-- Composite cron jobs remain schedulers; recipient-specific sends are controlled below.
UPDATE public.line_automation_controls SET
  name='Monday Brief coordinator', notification_type=NULL, importance='system', quota_impact='none',
  enabled=true, protected=true, decision='system', value_score=100, delivery_kind='system',
  purpose='เรียกตัวควบคุมข้อความ Mentor Co. และสมาชิกแยกกัน',
  recommendation='งานประสานระบบ ไม่ส่งข้อความโดยตรง'
WHERE automation_key='mondayMorningBrief';

UPDATE public.line_automation_controls SET
  name='Friday Recap coordinator', notification_type=NULL, importance='system', quota_impact='none',
  enabled=true, protected=true, decision='system', value_score=100, delivery_kind='system',
  purpose='เรียกตัวควบคุมข้อความสมาชิกและ Leaderboard แยกกัน',
  recommendation='งานประสานระบบ ไม่ส่งข้อความโดยตรง'
WHERE automation_key='fridayEveningReminder';

INSERT INTO public.line_automation_controls
  (automation_key,name,module,notification_type,source,schedule_label,audience,purpose,importance,quota_impact,enabled,protected,recommendation,decision,value_score,duplicate_group,duplicate_note,delivery_kind)
VALUES
  ('mondayBriefMc','Monday Brief — Mentor Co.','operational','monday_brief_mc','cron-jobs','จันทร์ 08:00','Mentor Co.','ภาพรวม Traffic Light สำหรับผู้ดูแล','normal','low',false,false,'ปิดไว้ก่อนเพราะ Dashboard ละเอียดกว่า','disable',35,'admin_dashboard_summary','ซ้ำกับ Overview และ Chapter Center','scheduled'),
  ('mondayBriefMembers','Monday Brief — สมาชิก','operational','monday_brief_members','cron-jobs','จันทร์ 08:00','สมาชิกทุกคน','ข้อความกระตุ้นเป้าหมายต้นสัปดาห์','low','high',false,false,'ปิดไว้เพราะเป็นข้อความกว้างและซ้ำกับหน้า Today','disable',20,'weekly_member_nudge','ซ้ำกับ Today, เป้าหมาย และคำสั่งสถานะ','scheduled'),
  ('fridayRecapMembers','Friday Recap — สมาชิก','operational','friday_recap_members','cron-jobs','ศุกร์ 13:00','สมาชิกทุกคน','เตือน Follow-up หลังประชุม','low','high',false,false,'ปิดไว้และใช้ Action เฉพาะเรื่องแทน','disable',25,'weekly_member_nudge','ซ้ำกับ Action Center และ Follow-up เฉพาะบุคคล','scheduled'),
  ('fridayLeaderboardMc','Friday Leaderboard — Mentor Co.','operational','friday_leaderboard_mc','cron-jobs','ศุกร์ 13:00','Mentor Co.','สรุปคะแนนทีมหลังประชุม','normal','low',true,false,'คงไว้ได้เพราะส่งเพียงผู้ดูแล','limit',65,'admin_dashboard_summary','ข้อมูลเดียวกันดูได้ใน Dashboard แต่ใช้โควตาต่ำ','scheduled')
ON CONFLICT (automation_key) DO UPDATE SET
  name=EXCLUDED.name,notification_type=EXCLUDED.notification_type,schedule_label=EXCLUDED.schedule_label,
  audience=EXCLUDED.audience,purpose=EXCLUDED.purpose,importance=EXCLUDED.importance,
  quota_impact=EXCLUDED.quota_impact,protected=EXCLUDED.protected,recommendation=EXCLUDED.recommendation,
  decision=EXCLUDED.decision,value_score=EXCLUDED.value_score,duplicate_group=EXCLUDED.duplicate_group,
  duplicate_note=EXCLUDED.duplicate_note,delivery_kind=EXCLUDED.delivery_kind;

UPDATE public.line_automation_controls SET delivery_kind='system' WHERE importance='system';
UPDATE public.line_automation_controls SET delivery_kind='event'
WHERE automation_key IN ('mentorTeamAlert','line121AutoReminder','renewalPush','passportLtReminder','visitorFollowUpReminder');
