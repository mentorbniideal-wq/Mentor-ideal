import type { AuthResult } from './auth.ts';

export type SignalAccessRow = {
  signal_type?: unknown;
  target_roles?: unknown;
  assigned_member_id?: unknown;
  members?: unknown;
};

const MENTOR_TEAM_ROLES = new Set(['toomtam', 'aof', 'draft', 'phai', 'amp']);

export function canViewMemberSignal(
  auth: AuthResult,
  row: SignalAccessRow,
  activeLtRoles: string[] = [],
): boolean {
  if (auth.isAdmin) return true;
  const type = String(row.signal_type || '');
  const targets = Array.isArray(row.target_roles) ? row.target_roles.map(String) : [];
  if (auth.memberId && String(row.assigned_member_id || '') === auth.memberId) return true;
  if (activeLtRoles.some(role => targets.includes(role))) return true;
  if (auth.role === 'growth') return type === 'goal';
  if (auth.role === 'mc') return type === 'member_help';
  if (auth.role === 'mentor_support') return type === 'member_help';
  if (MENTOR_TEAM_ROLES.has(String(auth.role || '')) && type === 'member_help') {
    const member = (row.members || {}) as Record<string, unknown>;
    return Boolean(auth.teamName) && String(member.mentor_team || '') === auth.teamName;
  }
  return false;
}

export function canManageMemberSignal(
  auth: AuthResult,
  row: SignalAccessRow,
  activeLtRoles: string[] = [],
): boolean {
  if (auth.isAdmin) return true;
  if (auth.role === 'mentor_support') return false;
  return canViewMemberSignal(auth, row, activeLtRoles);
}

const SIGNAL_TRANSITIONS: Record<string, string[]> = {
  new: ['acknowledged', 'in_progress', 'resolved', 'cancelled'],
  acknowledged: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
};

export function canTransitionMemberSignal(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return true;
  return (SIGNAL_TRANSITIONS[fromStatus] || []).includes(toStatus);
}
