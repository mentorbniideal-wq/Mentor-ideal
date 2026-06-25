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

export interface AbsenceNotice {
  memberId: string;
  memberName: string;
  nickname: string;
  mentorTeam: string;
  absenceType: string;
  detail: string;
  meetingDate: string;
  idempotencyKey: string;
  source: string;
}

export async function notifyAbsenceStakeholders(
  db: Db,
  notice: AbsenceNotice,
): Promise<{ sent: number; mcReady: boolean; mentorReady: boolean }> {
  const recipients = new Set<string>();
  let mcReady = false;
  let mentorReady = false;

  const { data: mcSettings } = await db.from('settings')
    .select('key, value')
    .in('key', ['MC_LINE_USER_ID', 'MC_LINE_ID', 'LINE_ID_MC']);
  for (const key of ['MC_LINE_USER_ID', 'MC_LINE_ID', 'LINE_ID_MC']) {
    const value = (mcSettings || []).find((row: Record<string, unknown>) => row.key === key)?.value;
    if (value) {
      recipients.add(String(value));
      mcReady = true;
    }
  }

  if (notice.mentorTeam) {
    const teamSettingKey = `LINE_ID_${notice.mentorTeam.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const { data: teamSetting } = await db.from('settings')
      .select('value')
      .eq('key', teamSettingKey)
      .maybeSingle();
    const configuredTeamId = String((teamSetting as Record<string, unknown> | null)?.value || '');
    if (configuredTeamId) {
      recipients.add(configuredTeamId);
      mentorReady = true;
    }

    const { data: mcAssignment } = await db.from('role_assignments')
      .select('team_name')
      .eq('role', 'mc')
      .maybeSingle();
    const mcAlsoLeadsTeam =
      String((mcAssignment as Record<string, unknown> | null)?.team_name || '').toLowerCase() ===
        notice.mentorTeam.toLowerCase();
    if (mcAlsoLeadsTeam && mcReady) mentorReady = true;

    const { data: assignment } = await db.from('role_assignments')
      .select('email')
      .or(`team_name.eq.${notice.mentorTeam},role.eq.${notice.mentorTeam.toLowerCase()}`)
      .eq('is_mentor', true)
      .limit(1)
      .maybeSingle();
    const mentorEmail = String((assignment as Record<string, unknown> | null)?.email || '');
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
        const assignedLineId = String((assignedLink as Record<string, unknown> | null)?.line_user_id || '');
        if (assignedLineId) {
          recipients.add(assignedLineId);
          mentorReady = true;
        }
      }
    }

    // Only fall through to leader_name lookup if still not resolved via settings or role_assignments
    if (!mentorReady) {
      const { data: team } = await db.from('mentor_teams')
        .select('leader_name')
        .eq('name', notice.mentorTeam)
        .maybeSingle();
      const leaderName = String((team as Record<string, unknown> | null)?.leader_name || '').trim();
      if (leaderName && !mcAlsoLeadsTeam) {
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
          const lineId = String((linked as Record<string, unknown> | null)?.line_user_id || '');
          if (lineId) {
            recipients.add(lineId);
            mentorReady = true;
          }
        }
      }
    }
  }

  if (!mentorReady) {
    await db.from('notifications').insert({
      type: 'mentor_line_recipient_missing',
      severity: 'warning',
      title: `หัวหน้าทีม ${notice.mentorTeam || 'ไม่ระบุทีม'} ยังรับ LINE Alert ไม่ได้`,
      body: `${notice.nickname || notice.memberName} แจ้ง ${notice.absenceType} วันที่ ${notice.meetingDate}`,
      data: { memberId: notice.memberId, mentorTeam: notice.mentorTeam, source: notice.source },
      target_audience: ['role:mc'],
    });
  }

  const date = new Date(`${notice.meetingDate}T00:00:00+07:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? notice.meetingDate
    : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const isSub = notice.absenceType === 'ส่ง sub';
  const message = [
    isSub ? '👥 แจ้งส่ง Sub' : '🙋 แจ้งลา / ขาดประชุม',
    `${notice.nickname || notice.memberName} · ทีม ${notice.mentorTeam || 'ยังไม่ระบุ'}`,
    `วันที่ ${dateLabel}`,
    isSub ? `ผู้มาแทน: ${notice.detail || 'ยังไม่ระบุ'}` : `เหตุผล: ${notice.detail || 'ไม่ระบุเหตุผล'}`,
  ].join('\n');

  let sent = 0;
  for (const recipient of recipients) {
    await linePush(recipient, message, {
      db,
      idempotencyKey: `${notice.idempotencyKey}:${recipient}`,
      memberId: notice.memberId,
      notificationType: 'absence',
      source: notice.source,
    });
    sent++;
  }
  return { sent, mcReady, mentorReady };
}
