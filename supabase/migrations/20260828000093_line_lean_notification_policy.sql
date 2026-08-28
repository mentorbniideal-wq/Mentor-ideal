-- Lean LINE policy: one useful action beats several informational summaries.
UPDATE public.line_automation_controls
SET enabled = false,
    recommendation = 'ปิดเป็นค่าเริ่มต้น: ซ้ำกับ Chapter Pulse และ Dashboard หลังประชุม',
    decision = 'disable',
    value_score = 30,
    updated_at = now(),
    updated_by = 'system:lean-policy'
WHERE automation_key = 'fridayLeaderboardMc';

UPDATE public.notification_budget_config
SET daily_member_cap = 1,
    weekly_reminder_cap = 2,
    cooldown_hours = GREATEST(cooldown_hours, 24),
    updated_at = now()
WHERE module IN ('global','one_to_one');

INSERT INTO public.settings(key,value) VALUES
  ('LINE_NOTIFICATION_POLICY','lean_action_first'),
  ('LINE_MEMBER_DAILY_CAP','1')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;

INSERT INTO public.line_automation_controls
  (automation_key,name,module,notification_type,source,schedule_label,audience,purpose,importance,quota_impact,enabled,protected,recommendation,decision,value_score,duplicate_group,duplicate_note,delivery_kind)
VALUES
  ('legacyGasMorningScore','[Legacy] Morning Score Card','legacy',NULL,'Google Apps Script','เคยส่งศุกร์ 07:00','สมาชิกทุกคน','สรุปคะแนนซ้ำกับ Today','low','high',false,true,'ย้ายออกจากตารางส่งแล้ว','disable',5,'friday_noise','ซ้ำกับ Score/Today และเคยมี trigger ซ้อน','system'),
  ('legacyGasTeamLeaderboard','[Legacy] Team Leaderboard','legacy',NULL,'Google Apps Script','เคยส่งศุกร์ 07:30','สมาชิกทุกคน','อันดับทีมที่ดูได้ใน Dashboard','low','high',false,true,'ย้ายออกจากตารางส่งแล้ว','disable',5,'friday_noise','ไม่มี Action ที่จำเป็นต้องส่งทุกคน','system'),
  ('legacyGasChapterPulse','[Legacy] Chapter Pulse','legacy',NULL,'Google Apps Script','เคยส่งศุกร์เช้า','Mentor Co.','ภาพรวมที่ซ้ำกับ Mentor Alert','normal','low',false,true,'ย้ายออกจากตารางส่งแล้ว','disable',15,'admin_dashboard_summary','ใช้ targeted Mentor Alert แทน','system'),
  ('legacyGasPostMeeting','[Legacy] Post-Meeting Checklist','legacy',NULL,'Google Apps Script','เคยส่งศุกร์ 13:00','สมาชิกทุกคน','Checklist ซ้ำกับ Friday Recap','low','high',false,true,'ย้ายออกจากตารางส่งแล้ว','disable',5,'friday_noise','ซ้ำกับ Friday Recap และ Action Center','system')
ON CONFLICT (automation_key) DO UPDATE SET
  enabled=false,protected=true,recommendation=EXCLUDED.recommendation,decision='disable',
  value_score=EXCLUDED.value_score,duplicate_note=EXCLUDED.duplicate_note,delivery_kind='system',updated_at=now();
