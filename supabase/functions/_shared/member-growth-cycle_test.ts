import { assertEquals } from 'jsr:@std/assert';
import { achievementPercent, canManageGrowthCycle, canReadGrowthCycle, cycleMonth, growthMilestone, membershipFacts, monthDueDate, parseDateOnly, renewalCycleStatus, todayInZone } from './member-growth-cycle.ts';

Deno.test('Growth Cycle always has exactly twelve stable month labels', () => {
  const dates = Array.from({ length: 12 }, (_, index) => monthDueDate('2027-01-31', index + 1));
  assertEquals(dates.length, 12);
  assertEquals(dates[0], '2026-02-28');
  assertEquals(dates[11], '2027-01-31');
  assertEquals(cycleMonth('2027-01-31', '2026-07-31'), 6);
  assertEquals(cycleMonth('2027-01-31', '2026-10-31'), 9);
});

Deno.test('Leap day and month-end dates clamp without changing milestone number', () => {
  assertEquals(monthDueDate('2024-02-29', 1), '2023-03-29');
  assertEquals(monthDueDate('2024-02-29', 12), '2024-02-29');
  assertEquals(monthDueDate('2025-03-31', 11), '2025-02-28');
  assertEquals(monthDueDate('2027-03-31', 11), '2027-02-28');
  assertEquals(monthDueDate('2028-03-31', 11), '2028-02-29');
  assertEquals(parseDateOnly('2027-02-29'), null);
  assertEquals(monthDueDate('invalid', 6), null);
});

Deno.test('Month 3 is Mentor-only for new members; core milestones keep owners', () => {
  assertEquals(growthMilestone(1, false)?.owner, 'Growth');
  assertEquals(growthMilestone(3, false), null);
  assertEquals(growthMilestone(3, true)?.owner, 'Mentor');
  assertEquals(growthMilestone(6, true)?.owner, 'Growth');
  assertEquals(growthMilestone(9, false)?.owner, 'Growth → Membership Committee');
  assertEquals(growthMilestone(12, false)?.owner, 'Membership Committee');
});

Deno.test('Growth Cycle writes require a signed-in named actor and explicit capability', () => {
  assertEquals(canReadGrowthCycle({}), false);
  assertEquals(canReadGrowthCycle({ email: 'growth@example.test' }), true);
  assertEquals(canManageGrowthCycle({ email: 'growth@example.test', capabilities: [] }), false);
  assertEquals(canManageGrowthCycle({ email: 'growth@example.test', capabilities: ['growth.task.manage_assigned'] }), false);
  assertEquals(canManageGrowthCycle({ email: 'growth@example.test', capabilities: ['growth.cycle.manage'] }), false);
  assertEquals(canManageGrowthCycle({ email: 'coordinator@example.test', capabilities: ['growth.coordinate'] }), true);
  assertEquals(canManageGrowthCycle({ email: 'coordinator@example.test', capabilities: ['growth.coordinate'], isReadOnly: true }), false);
  assertEquals(canManageGrowthCycle({ capabilities: ['growth.coordinate'] }), false);
});

Deno.test('Month 6 result comparison does not fabricate progress for zero target', () => {
  assertEquals(achievementPercent(250000, 500000), 50);
  assertEquals(achievementPercent(100, 0), null);
  assertEquals(achievementPercent(null, 100), 0);
  assertEquals(achievementPercent('bad', 100), null);
});

Deno.test('Renewal status is derived from Membership workflow without Growth ownership', () => {
  assertEquals(renewalCycleStatus('completed'), 'Renewed');
  assertEquals(renewalCycleStatus('declined'), 'Not Renewed');
  assertEquals(renewalCycleStatus('confirmed_renew'), 'Pending');
  assertEquals(renewalCycleStatus(null), 'Unknown');
});

Deno.test('Current date follows Chapter timezone at day boundary', () => {
  const instant = new Date('2027-01-01T18:30:00Z');
  assertEquals(todayInZone('Asia/Bangkok', instant), '2027-01-02');
  assertEquals(todayInZone('UTC', instant), '2027-01-01');
});

Deno.test('Membership facts use recorded BNI start and latest Renewal, never infer a renewal from the cycle', () => {
  assertEquals(membershipFacts({ joined_date: '2024-03-01', membership_start_date: '2025-01-01' },
    { expiry_date: '2027-03-01', completed_at: '2026-03-02T08:00:00Z' }, '2026-09-29'), {
    membershipStartDate: '2024-03-01', membershipStartSource: 'bni_joined_date', membershipDays: 942,
    lastRenewedOn: '2026-03-02', expiryDate: '2027-03-01',
  });
  assertEquals(membershipFacts({ membership_start_date: '2025-01-01' }, { expiry_date: '2026-12-01' }, '2026-09-29').lastRenewedOn, null);
  assertEquals(membershipFacts({ joined_date: '2024-01-01' }, { expiry_date: '2027-01-01', completed_at: '2025-01-02T00:00:00Z', extended_at: '2026-01-03T00:00:00Z' }, '2026-09-29').lastRenewedOn, '2026-01-03');
  assertEquals(membershipFacts({}, { expiry_date: '2026-12-01' }, '2026-09-29').membershipDays, null);
  assertEquals(membershipFacts({ joined_date: '2027-01-01' }, { expiry_date: 'bad' }, '2026-09-29').expiryDate, null);
  const inconsistent = membershipFacts({ joined_date: '2026-01-01', membership_start_date: '2024-01-01' }, null, '2026-09-29');
  assertEquals(inconsistent.membershipStartSource, 'chapter_start_date');
  assertEquals(inconsistent.membershipStartDate, '2024-01-01');
});
