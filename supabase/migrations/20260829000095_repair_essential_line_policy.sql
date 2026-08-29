-- Repair the essential-only preset introduced in migration 094.
-- Monday Brief and Friday Evening Reminder are broad informational broadcasts;
-- both were intentionally disabled by the preceding value review and lean policy.

UPDATE public.line_automation_controls
SET enabled = false,
    decision = 'disable',
    recommendation = 'ปิดตามนโยบาย Essential-only: ดูข้อมูลสรุปใน Dashboard แทนการส่ง LINE แบบกว้าง',
    updated_at = now(),
    updated_by = 'system:essential-only-policy-repair'
WHERE automation_key IN ('mondayMorningBrief', 'fridayEveningReminder');

-- Keep the database budget configuration aligned with the advertised policy.
UPDATE public.notification_budget_config
SET daily_member_cap = 1,
    weekly_reminder_cap = 2,
    cooldown_hours = GREATEST(cooldown_hours, 24),
    updated_at = now()
WHERE module IN ('global', 'one_to_one');

