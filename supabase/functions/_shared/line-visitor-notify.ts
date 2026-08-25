import { linePush } from './line.ts';
import { resolveLtLineRecipients } from './lt-role-routing.ts';

type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export async function notifyVisitorStakeholders(db: Db, input: {
  visitorLogId: string;
  visitorName: string;
  visitDate: string;
  invitedByMemberId: string;
  invitedByName: string;
  notes: string;
  source: string;
}) {
  const routing = await resolveLtLineRecipients(db, 'visitor');
  const recipients = new Set(routing.recipients);
  if (!recipients.size) {
    const { data: settings } = await db.from('settings').select('key,value')
      .in('key', ['MC_LINE_USER_ID', 'MC_LINE_ID', 'LINE_ID_MC']);
    for (const row of settings || []) {
      const value = String((row as Record<string, unknown>).value || '');
      if (value) recipients.add(value);
    }
  }
  const date = new Date(`${input.visitDate}T00:00:00+07:00`);
  const dateLabel = Number.isNaN(date.getTime()) ? input.visitDate : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const message = [
    '👋 มีแขกพิเศษลงทะเบียน',
    `แขก: ${input.visitorName}`,
    `ผู้เชิญ: ${input.invitedByName}`,
    `วันที่มา: ${dateLabel}`,
    input.notes ? `ข้อมูลเพิ่มเติม: ${input.notes}` : '',
    '', 'กรุณาเตรียมการต้อนรับและตรวจข้อมูลใน Visitor Dashboard',
  ].filter(Boolean).join('\n');
  let sent = 0;
  for (const recipient of recipients) {
    await linePush(recipient, message, {
      db, idempotencyKey: `visitor:new:${input.visitorLogId}:${recipient}`,
      memberId: input.invitedByMemberId, notificationType: 'visitor_registered', source: input.source,
    });
    sent++;
  }
  if (routing.missingRoles.length) {
    await db.from('notifications').insert({
      type: 'lt_role_recipient_missing', severity: 'warning',
      title: 'ตำแหน่งรับแจ้ง Visitor ยังตั้งค่าไม่ครบ',
      body: `ยังไม่ได้กำหนด ${routing.missingRoles.join(', ')} ใน LT Team`,
      data: { scope: 'visitor', missingRoles: routing.missingRoles, visitorLogId: input.visitorLogId },
      target_audience: ['role:mc'],
    });
  }
  return { sent, usedFallback: routing.recipients.length === 0 };
}
