import { canManageMemberSignal, canViewMemberSignal } from './member-signal-access.ts';

const help = { signal_type: 'member_help', target_roles: ['Mentor Coordinator'], members: { mentor_team: 'Aof' } };

Deno.test('Chapter Admin sees and manages every member signal', () => {
  const auth = { ok: true, role: 'admin', isAdmin: true };
  if (!canViewMemberSignal(auth, { signal_type: 'renewal' })) throw new Error('admin view denied');
  if (!canManageMemberSignal(auth, { signal_type: 'training' })) throw new Error('admin manage denied');
});

Deno.test('Mentor sees only help signals from their own stable team code', () => {
  const auth = { ok: true, role: 'aof', isMentor: true, teamName: 'Aof' };
  if (!canViewMemberSignal(auth, help)) throw new Error('own team denied');
  if (canViewMemberSignal(auth, { ...help, members: { mentor_team: 'AMP' } })) throw new Error('cross team leaked');
  if (canViewMemberSignal(auth, { signal_type: 'renewal', members: { mentor_team: 'Aof' } })) throw new Error('module leaked');
});

Deno.test('Mentor Support reviews help requests but cannot update them', () => {
  const auth = { ok: true, role: 'mentor_support', isMentor: true };
  if (!canViewMemberSignal(auth, help)) throw new Error('support view denied');
  if (canManageMemberSignal(auth, help)) throw new Error('support direct action allowed');
});

Deno.test('Active LT holder sees signals routed to their role', () => {
  const auth = { ok: true, role: 'toomtam', memberId: 'member-1' };
  const training = { signal_type: 'training', target_roles: ['Network Education Coordinator'] };
  if (!canViewMemberSignal(auth, training, ['Network Education Coordinator'])) throw new Error('LT route denied');
});
