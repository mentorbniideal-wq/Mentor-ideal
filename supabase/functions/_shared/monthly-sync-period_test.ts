import { assertEquals } from 'jsr:@std/assert';
import { evolutionIsHistorical, memberTrafficLightReportPeriod, reportedScore } from './monthly-sync-period.ts';

Deno.test('August report may carry Evolution history ending July', () => {
  assertEquals(memberTrafficLightReportPeriod([["BNI Ideal : Member Traffic Lights Aug'26"]]), '2026-08');
  assertEquals(evolutionIsHistorical(['2025-08', '2026-07'], '2026-08'), true);
});

Deno.test('rejects a different report month or future Evolution score', () => {
  assertEquals(memberTrafficLightReportPeriod([["Member Traffic Lights Sep'26"]]), '2026-09');
  assertEquals(evolutionIsHistorical(['2026-09'], '2026-08'), false);
});

Deno.test('keeps an explicit score of zero and excludes missing values', () => {
  assertEquals(reportedScore('0'), 0);
  assertEquals(reportedScore(' 0 '), 0);
  assertEquals(reportedScore(''), null);
  assertEquals(reportedScore('N/A'), null);
});
