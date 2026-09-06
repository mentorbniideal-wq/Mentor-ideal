import { canManageMemberSignal, canTransitionMemberSignal, canViewMemberSignal } from './member-signal-access.ts';

const help = { signal_type: 'member_help', target_roles: ['Mentor Coordinator'], members: { mentor_team: 'Aof' } };
const referral = { signal_type: 'referral', target_roles: ['Growth Coordinator'], members: { mentor_team: 'Aof' } };

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
  if (!canViewMemberSignal(auth, referral)) throw new Error('own-team referral denied');
});

Deno.test('Growth sees referrals but not private member care', () => {
  const auth = { ok: true, role: 'growth', memberId: 'growth-1' };
  if (!canViewMemberSignal(auth, referral)) throw new Error('growth referral denied');
  if (canViewMemberSignal(auth, help)) throw new Error('private member care leaked to growth');
});

Deno.test('Mentor Co sees confidential cases while Mentor Support does not', () => {
  const confidential = { signal_type: 'confidential', target_roles: ['Membership Committee'] };
  if (!canViewMemberSignal({ ok: true, role: 'mc' }, confidential)) throw new Error('mentor co confidential denied');
  if (canViewMemberSignal({ ok: true, role: 'mentor_support' }, confidential)) throw new Error('confidential case leaked to support');
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

Deno.test('closed member signals cannot regress without a dedicated reopen workflow', () => {
  if (!canTransitionMemberSignal('new', 'in_progress')) throw new Error('valid transition denied');
  if (!canTransitionMemberSignal('in_progress', 'resolved')) throw new Error('completion denied');
  if (canTransitionMemberSignal('resolved', 'in_progress')) throw new Error('resolved work reopened');
  if (canTransitionMemberSignal('cancelled', 'acknowledged')) throw new Error('cancelled work reopened');
});
