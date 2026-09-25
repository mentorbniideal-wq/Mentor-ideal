import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { nextCustomLineRun } from './custom-line-automation.ts';

Deno.test('one-time custom LINE automation disables after its scheduled occurrence', () => {
  assertEquals(nextCustomLineRun('once', '2026-09-25T02:00:00.000Z', new Date('2026-09-25T02:05:00.000Z')), {
    enabled: false,
    nextRunAt: '2026-09-25T02:00:00.000Z',
  });
});

Deno.test('weekly custom LINE automation preserves the intended instant and skips catch-up floods', () => {
  assertEquals(nextCustomLineRun('weekly', '2026-09-04T02:00:00.000Z', new Date('2026-09-25T02:05:00.000Z')), {
    enabled: true,
    nextRunAt: '2026-10-02T02:00:00.000Z',
  });
});

Deno.test('daily and monthly custom LINE recurrence advance without catch-up floods', () => {
  assertEquals(nextCustomLineRun('daily', '2026-09-23T02:00:00.000Z', new Date('2026-09-25T02:05:00.000Z')).nextRunAt, '2026-09-26T02:00:00.000Z');
  assertEquals(nextCustomLineRun('monthly', '2026-01-31T02:00:00.000Z', new Date('2026-02-01T00:00:00.000Z')).nextRunAt, '2026-02-28T02:00:00.000Z');
});

Deno.test('custom LINE schedule rejects an invalid persisted instant', () => {
  assertThrows(() => nextCustomLineRun('weekly', 'not-a-date'));
});
