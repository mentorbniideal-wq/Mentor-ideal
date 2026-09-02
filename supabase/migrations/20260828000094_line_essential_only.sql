-- Essential-only LINE policy.
-- Keep coordinator/system jobs enabled because they do not send messages themselves.
-- Everything else starts disabled unless it has a clear, time-sensitive next action.

UPDATE public.line_automation_controls
SET enabled = automation_key IN (
      'mondayMorningBrief',
      'fridayEveningReminder',
      'wednesdayNudge',
      'mentorTeamAlert',
      'line121AutoReminder',
      'renewalPush',
      'passportLtReminder',
      'visitorFollowUpReminder',
      'provisionLineExperience',
      'purgeExpiredDismissals'
    ),
    updated_at = now(),
    updated_by = 'system:essential-only-policy'
WHERE protected = false
   OR automation_key IN (
      'mondayMorningBrief',
      'fridayEveningReminder',
      'wednesdayNudge',
      'mentorTeamAlert',
      'line121AutoReminder',
      'renewalPush',
      'passportLtReminder',
      'visitorFollowUpReminder',
      'provisionLineExperience',
      'purgeExpiredDismissals'
   );

UPDATE public.line_automation_controls
SET decision = 'keep',
    importance = CASE
      WHEN automation_key IN ('mentorTeamAlert','renewalPush','passportLtReminder') THEN 'critical'
      ELSE 'high'
    END,
    recommendation = 'คงไว้: ส่งเฉพาะเมื่อมี Action ที่ผู้รับต้องดำเนินการ',
    value_score = CASE
      WHEN automation_key = 'mentorTeamAlert' THEN 95
      WHEN automation_key IN ('renewalPush','passportLtReminder') THEN 92
      WHEN automation_key IN ('line121AutoReminder','visitorFollowUpReminder') THEN 88
      ELSE 82
    END,
    updated_at = now()
WHERE automation_key IN (
  'wednesdayNudge','mentorTeamAlert','line121AutoReminder',
  'renewalPush','passportLtReminder','visitorFollowUpReminder'
);

UPDATE public.line_automation_controls
SET decision = 'disable',
    recommendation = 'ปิดตามนโยบาย Essential-only: ดูข้อมูลนี้ใน Dashboard แทนการส่ง LINE',
    updated_at = now()
WHERE enabled = false
  AND delivery_kind <> 'system';

INSERT INTO public.settings(key,value) VALUES
  ('LINE_NOTIFICATION_POLICY','essential_only'),
  ('LINE_MEMBER_DAILY_CAP','1'),
  ('LINE_MEMBER_WEEKLY_REMINDER_CAP','2')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
