// deno-lint-ignore-file no-explicit-any
// Supabase query-builder chains are dynamic until generated database types are introduced.
import { linePush } from './line.ts';

type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export interface IssueNotice {
  issueId: string;
  memberId: string;
  memberName: string;
  nickname: string;
  mentorTeam: string;
  issueText: string;
  idempotencyKey: string;
  source: string;
}

export interface IssueNotifyResult {
  sent: number;
  mentorReady: boolean;
  quotaOk: boolean;
  skippedReason?: 'no_recipient' | 'no_token' | 'quota_low' | 'quota_error';
  remaining?: number | null;
}

function settingKeysForTeam(team: string): string[] {
  const trimmed = team.trim();
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return [...new Set([
    `LINE_ID_${trimmed}`,
    `LINE_ID_${normalized}`,
  ].filter(key => key !== 'LINE_ID_'))];
}

async function resolveTeamLeaderLineRecipients(db: Db, mentorTeam: string): Promise<{ recipients: string[]; ready: boolean }> {
  const recipients = new Set<string>();
  let ready = false;
  const team = mentorTeam.trim();

  if (!team) return { recipients: [], ready: false };

  const keys = settingKeysForTeam(team);
  if (keys.length) {
    const { data: settings } = await db.from('settings')
      .select('key, value')
      .in('key', keys);
    for (const row of settings || []) {
      const value = String((row as Record<string, unknown>).value || '').trim();
      if (value) {
        recipients.add(value);
        ready = true;
      }
    }
  }

  const { data: assignment } = await db.from('role_assignments')
    .select('email')
    .eq('team_name', team)
    .eq('is_mentor', true)
    .limit(1)
    .maybeSingle();
  const mentorEmail = String((assignment as Record<string, unknown> | null)?.email || '').trim();
  if (mentorEmail) {
    const { data: assignedMember } = await db.from('members')
      .select('id')
      .ilike('email', mentorEmail)
      .maybeSingle();
    if (assignedMember) {
      const { data: assignedLink } = await db.from('line_members')
        .select('line_user_id')
        .eq('member_id', String((assignedMember as Record<string, unknown>).id))
        .maybeSingle();
      const lineId = String((assignedLink as Record<string, unknown> | null)?.line_user_id || '').trim();
      if (lineId) {
        recipients.add(lineId);
        ready = true;
      }
    }
  }

  if (!ready) {
    const { data: mentorTeamRow } = await db.from('mentor_teams')
      .select('leader_name')
      .eq('name', team)
      .maybeSingle();
    const leaderName = String((mentorTeamRow as Record<string, unknown> | null)?.leader_name || '').trim();
    if (leaderName) {
      const { data: leader } = await db.from('members')
        .select('id')
        .or(`name.ilike.%${leaderName}%,nickname.ilike.%${leaderName}%`)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle();
      if (leader) {
        const { data: linked } = await db.from('line_members')
          .select('line_user_id')
          .eq('member_id', String((leader as Record<string, unknown>).id))
          .maybeSingle();
        const lineId = String((linked as Record<string, unknown> | null)?.line_user_id || '').trim();
        if (lineId) {
          recipients.add(lineId);
          ready = true;
        }
      }
    }
  }

  return { recipients: [...recipients], ready };
}

async function getLineQuota(recipients: number): Promise<{
  ok: boolean;
  remaining?: number | null;
  reason?: IssueNotifyResult['skippedReason'];
}> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { ok: false, reason: 'no_token' };

  const reserve = Number(Deno.env.get('LINE_ALERT_QUOTA_RESERVE') || 20);
  try {
    const [quotaRes, usageRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!quotaRes.ok || !usageRes.ok) return { ok: false, reason: 'quota_error' };
    const quota = await quotaRes.json() as Record<string, unknown>;
    const usage = await usageRes.json() as Record<string, unknown>;
    if (String(quota.type || '') === 'unlimited') return { ok: true, remaining: null };
    const limit = Number(quota.value) || 0;
    const used = Number(usage.totalUsage) || 0;
    const remaining = Math.max(0, limit - used);
    if (remaining < recipients + reserve) return { ok: false, remaining, reason: 'quota_low' };
    return { ok: true, remaining };
  } catch {
    return { ok: false, reason: 'quota_error' };
  }
}

async function notifyMcInDashboard(db: Db, notice: IssueNotice, title: string, body: string, skippedReason?: string) {
  await db.from('notifications').insert({
    type: 'line_issue_alert',
    severity: skippedReason ? 'warning' : 'info',
    title,
    body,
    data: {
      issueId: notice.issueId,
      memberId: notice.memberId,
      mentorTeam: notice.mentorTeam,
      source: notice.source,
      skippedReason,
    },
    target_audience: ['role:mc'],
  });
}

export async function notifyIssueStakeholders(db: Db, notice: IssueNotice): Promise<IssueNotifyResult> {
  const { recipients, ready } = await resolveTeamLeaderLineRecipients(db, notice.mentorTeam);
  const nickname = notice.nickname || notice.memberName.split(' ')[0] || notice.memberName;

  if (!recipients.length) {
    await notifyMcInDashboard(
      db,
      notice,
      `ยังไม่มี LINE หัวหน้าทีม ${notice.mentorTeam || 'ไม่ระบุทีม'}`,
      `${nickname} ส่งคำขอความช่วยเหลือ: ${notice.issueText}`,
      'no_recipient',
    );
    return { sent: 0, mentorReady: ready, quotaOk: true, skippedReason: 'no_recipient' };
  }

  const quota = await getLineQuota(recipients.length);
  if (!quota.ok) {
    await notifyMcInDashboard(
      db,
      notice,
      quota.reason === 'quota_low' ? 'LINE quota ใกล้เต็ม — งด Push อัตโนมัติ' : 'ส่ง LINE Alert อัตโนมัติไม่ได้',
      `${nickname} ส่งคำขอความช่วยเหลือ ทีม ${notice.mentorTeam || 'ไม่ระบุทีม'} — เปิดดูได้ที่ Activity → LINE Activity`,
      quota.reason,
    );
    return {
      sent: 0,
      mentorReady: ready,
      quotaOk: false,
      skippedReason: quota.reason,
      remaining: quota.remaining,
    };
  }

  const detail = notice.issueText.length > 180 ? `${notice.issueText.slice(0, 177)}...` : notice.issueText;
  const message = [
    '🆘 ขอความช่วยเหลือจากสมาชิก',
    `${nickname} · ทีม ${notice.mentorTeam || 'ยังไม่ระบุ'}`,
    `เรื่อง: ${detail}`,
    '',
    'ตอบกลับ/ปิดเคสได้ที่ MC Dashboard → Activity → LINE Activity',
  ].join('\n');

  let sent = 0;
  for (const recipient of recipients) {
    await linePush(recipient, message, {
      db,
      idempotencyKey: `${notice.idempotencyKey}:${recipient}`,
      memberId: notice.memberId,
      notificationType: 'issue_alert',
      source: notice.source,
    });
    sent++;
  }

  return { sent, mentorReady: ready, quotaOk: true, remaining: quota.remaining };
}
