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

export function notificationBudgetDecision(input:{monthlyUsed:number;monthlyQuota:number;priority:'critical'|'action_required'|'reminder'|'informational';dailyCount:number;weeklyReminderCount:number;hoursSinceLast:number;quietHours:boolean;duplicate:boolean;actionComplete:boolean;dailyCap?:number;weeklyReminderCap?:number;cooldownHours?:number}) {
  const dailyCap = Math.max(1, Number(input.dailyCap ?? 1));
  const weeklyReminderCap = Math.max(1, Number(input.weeklyReminderCap ?? 3));
  const cooldownHours = Math.max(0, Number(input.cooldownHours ?? 20));
  if (input.actionComplete) return {allowed:false,reason:'action_completed'};
  if (input.duplicate) return {allowed:false,reason:'duplicate'};
  if (input.quietHours && input.priority !== 'critical') return {allowed:false,reason:'quiet_hours'};
  if (input.dailyCount >= dailyCap && input.priority !== 'critical') return {allowed:false,reason:'daily_cap'};
  if (input.priority === 'reminder' && input.weeklyReminderCount >= weeklyReminderCap) return {allowed:false,reason:'weekly_cap'};
  if (input.hoursSinceLast < cooldownHours && !['critical','action_required'].includes(input.priority)) return {allowed:false,reason:'cooldown'};
  const usage = input.monthlyQuota > 0 ? input.monthlyUsed / input.monthlyQuota : 1;
  if (usage >= .95) return {allowed:false,reason:'admin_approval_required'};
  if (usage >= .9 && !['critical','action_required'].includes(input.priority)) return {allowed:false,reason:'quota_90'};
  if (usage >= .85 && input.priority === 'reminder') return {allowed:false,reason:'quota_85'};
  if (usage >= .75 && input.priority === 'informational') return {allowed:false,reason:'quota_75'};
  return {allowed:true,reason:'allowed'};
}

export function generateHandshakeCode(randomValues?: Uint32Array): string {
  const values=randomValues || crypto.getRandomValues(new Uint32Array(1));
  return String(values[0] % 1_000_000).padStart(6,'0');
}

export async function handshakeCodeHash(pairId:string,ownerMemberId:string,code:string,pepper:string):Promise<string>{
  if(!/^\d{6}$/.test(code))throw new Error('รหัสต้องเป็นตัวเลข 6 หลัก');
  const bytes=new TextEncoder().encode(`${pairId}:${ownerMemberId}:${code}:${pepper}`);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function sharedTrioHandshakeCode(pairId:string,pepper:string):Promise<string>{
  const bytes=new TextEncoder().encode(`trio:${pairId}:${pepper}`);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const value=((digest[0]<<24)>>>0)+(digest[1]<<16)+(digest[2]<<8)+digest[3];
  return String(value%1_000_000).padStart(6,'0');
}

export function safeHashEqual(left:string,right:string):boolean{
  if(left.length!==right.length)return false;let difference=0;
  for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index);
  return difference===0;
}

export function pairStatusFromVerification(memberAVerified:boolean,memberBVerified:boolean,endsAt:string,now=new Date()):string{
  if(memberAVerified&&memberBVerified)return now>new Date(endsAt)?'late_verified':'verified';
  if(memberAVerified||memberBVerified)return 'partially_verified';
  return 'awaiting_verification';
}
