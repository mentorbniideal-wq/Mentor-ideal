export type CalendarEvent121 = {
  uid: string; partnerName: string; startsAt: string; durationMinutes?: number;
  mode?: string; location?: string; timezone?: string;
};

const icsEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsUtc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function oneToOneIcs(event: CalendarEvent121): string {
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error('วันและเวลานัดไม่ถูกต้อง');
  const end = new Date(start.getTime() + Number(event.durationMinutes || 45) * 60000);
  const title = `BNI IDEAL — 1-2-1 กับ ${event.partnerName}`;
  const detail = `รูปแบบ: ${event.mode || 'นัดหมาย 1-2-1'}${event.location ? `\nสถานที่/ลิงก์: ${event.location}` : ''}`;
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BNI IDEAL//1-2-1 System//TH','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${icsEscape(event.uid)}`,`DTSTAMP:${icsUtc(new Date())}`,`DTSTART:${icsUtc(start)}`,`DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(title)}`,`DESCRIPTION:${icsEscape(detail)}`,'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:BNI IDEAL 1-2-1','END:VALARM',
    'BEGIN:VALARM','TRIGGER:-PT1H','ACTION:DISPLAY','DESCRIPTION:BNI IDEAL 1-2-1','END:VALARM','END:VEVENT','END:VCALENDAR',''
  ].join('\r\n');
}

export function oneToOneGoogleCalendarUrl(event: CalendarEvent121): string {
  const start = new Date(event.startsAt); const end = new Date(start.getTime() + Number(event.durationMinutes || 45) * 60000);
  const query = new URLSearchParams({action:'TEMPLATE',text:`BNI IDEAL — 1-2-1 กับ ${event.partnerName}`,dates:`${icsUtc(start)}/${icsUtc(end)}`,details:`รูปแบบ: ${event.mode || '1-2-1'}`,location:event.location || ''});
  return `https://calendar.google.com/calendar/render?${query}`;
}

export function notificationBudgetDecision(input:{monthlyUsed:number;monthlyQuota:number;priority:'critical'|'action_required'|'reminder'|'informational';dailyCount:number;weeklyReminderCount:number;hoursSinceLast:number;quietHours:boolean;duplicate:boolean;actionComplete:boolean}) {
  if (input.actionComplete) return {allowed:false,reason:'action_completed'};
  if (input.duplicate) return {allowed:false,reason:'duplicate'};
  if (input.quietHours && input.priority !== 'critical') return {allowed:false,reason:'quiet_hours'};
  if (input.dailyCount >= 1 && input.priority !== 'critical') return {allowed:false,reason:'daily_cap'};
  if (input.priority === 'reminder' && input.weeklyReminderCount >= 3) return {allowed:false,reason:'weekly_cap'};
  if (input.hoursSinceLast < 20 && !['critical','action_required'].includes(input.priority)) return {allowed:false,reason:'cooldown'};
  const usage = input.monthlyQuota > 0 ? input.monthlyUsed / input.monthlyQuota : 1;
  if (usage >= .95) return {allowed:false,reason:'admin_approval_required'};
  if (usage >= .9 && !['critical','action_required'].includes(input.priority)) return {allowed:false,reason:'quota_90'};
  if (usage >= .85 && input.priority === 'reminder') return {allowed:false,reason:'quota_85'};
  if (usage >= .75 && input.priority === 'informational') return {allowed:false,reason:'quota_75'};
  return {allowed:true,reason:'allowed'};
}
