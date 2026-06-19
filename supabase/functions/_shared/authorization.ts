import type { AuthResult } from './auth.ts';
import type { getServiceClient } from './db.ts';

type DbClient = ReturnType<typeof getServiceClient>;

export type MemberAccess = {
  id: string;
  name: string;
  nickname: string | null;
  mentorTeam: string | null;
};

export function isGrowth(auth: AuthResult): boolean {
  return String(auth.role || '').toLowerCase() === 'growth';
}

export function canAccessTeam(
  auth: AuthResult,
  teamName: string | null,
  options: { allowGrowth?: boolean } = {},
): boolean {
  if (auth.isMC) return true;
  if (options.allowGrowth && isGrowth(auth)) return true;
  return Boolean(auth.teamName && teamName && auth.teamName === teamName);
}

export async function resolveMemberAccess(
  db: DbClient,
  payload: Record<string, unknown>,
): Promise<{ member?: MemberAccess; error?: string }> {
  const memberId = String(payload.memberId || payload.member_id || '').trim();
  const memberName = String(
    payload.memberName || payload.menteeName || payload.name || payload.fileUrl || '',
  ).replace(/\s*\([^)]+\)\s*$/, '').trim();

  let query = db
    .from('members')
    .select('id, name, nickname, mentor_team')
    .eq('is_archived', false);

  if (memberId) query = query.eq('id', memberId);
  else if (memberName) query = query.eq('name', memberName);
  else return { error: 'memberId or memberName required' };

  const { data, error } = await query.maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `ไม่พบสมาชิก: ${memberName || memberId}` };

  const row = data as Record<string, unknown>;
  return {
    member: {
      id: String(row.id),
      name: String(row.name || ''),
      nickname: row.nickname == null ? null : String(row.nickname),
      mentorTeam: row.mentor_team == null ? null : String(row.mentor_team),
    },
  };
}

export function memberAccessError(
  auth: AuthResult,
  member: MemberAccess,
  options: { allowGrowth?: boolean } = {},
): string | null {
  return canAccessTeam(auth, member.mentorTeam, options)
    ? null
    : 'ไม่มีสิทธิ์เข้าถึงข้อมูลสมาชิกทีมอื่น';
}
