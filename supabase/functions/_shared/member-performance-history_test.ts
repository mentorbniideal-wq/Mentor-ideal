import { assertEquals } from 'jsr:@std/assert';
import { buildMemberPerformanceHistory } from './member-performance-history.ts';

Deno.test('keeps month snapshots separate and never calls a cumulative difference monthly activity', () => {
  const rows = buildMemberPerformanceHistory([
    { year: 2026, month: 8, referral_value: 5, tyfcb_value: 500000 },
    { year: 2026, month: 9, referral_value: 8, tyfcb_value: 560000 },
  ], []);
  assertEquals(rows.map(row => row.period), ['2026-09', '2026-08']);
  assertEquals(rows[0].tyfcbGivenSnapshot, 560000);
  assertEquals(rows[0].monthlyActivityVerified, false);
  assertEquals(Object.hasOwn(rows[0], 'monthlyTyfcbGiven'), false);
});

Deno.test('preserves score-only periods without inventing missing PALMS values', () => {
  const rows = buildMemberPerformanceHistory([], [{ year: 2026, month: 9, score: 55, source: 'traffic_light_csv' }]);
  assertEquals(rows[0].trafficLightScore, 55);
  assertEquals(rows[0].referralGivenSnapshot, null);
  assertEquals(rows[0].source, 'traffic_light_csv');
});
