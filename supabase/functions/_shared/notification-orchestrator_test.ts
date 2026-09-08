import { canOverrideDailyCap } from './notification-orchestrator.ts';

Deno.test('chapter admin can explicitly override only the daily cap', () => {
  if (!canOverrideDailyCap('daily_cap', true, true)) throw new Error('confirmed admin override should be accepted');
  for (const reason of ['weekly_cap', 'cooldown', 'duplicate', 'quiet_hours', 'member_muted', 'emergency_stop']) {
    if (canOverrideDailyCap(reason, true, true)) throw new Error(`${reason} must remain enforced`);
  }
});

Deno.test('daily cap override requires both admin authority and confirmation', () => {
  if (canOverrideDailyCap('daily_cap', false, true)) throw new Error('non-admin must not override');
  if (canOverrideDailyCap('daily_cap', true, false)) throw new Error('unconfirmed override must not send');
});
