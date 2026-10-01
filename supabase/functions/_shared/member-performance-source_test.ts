import { assertEquals } from 'jsr:@std/assert';
import { performanceSourceRows, sourceSnapshotHistory, trustedSourceSnapshotHistory } from './member-performance-source.ts';

Deno.test('keeps each source distinct and leaves unavailable metrics null', () => {
  const period = { year: 2026, month: 8 };
  const mtl = performanceSourceRows([{ member_id: 'same-id', rg: 15, rr: 5, given: 45000, received: 60000 }], 'member_traffic_light', 'chapter', 'batch', period)[0];
  const r2y = performanceSourceRows([{ member_id: 'same-id', rg: 14, rr: 5, tyfcb_thb: 43000 }], 'reporting2you', 'chapter', 'batch', period)[0];
  assertEquals(mtl.tyfcb_received, 60000);
  assertEquals(r2y.tyfcb_received, null);
  assertEquals(r2y.visitors, null);
  assertEquals(mtl.source_type, 'member_traffic_light');
  assertEquals(r2y.source_type, 'reporting2you');
  assertEquals(mtl.source_semantics, 'needs_verification');
});

Deno.test('history exposes provenance but cannot manufacture monthly activity', () => {
  const history = sourceSnapshotHistory([{ period_year: 2026, period_month: 8, source_type: 'member_traffic_light', source_semantics: 'needs_verification', tyfcb_received: 60000, import_batch_id: 'batch' }]);
  assertEquals(history[0].tyfcbReceived, 60000);
  assertEquals(history[0].batchId, 'batch');
  assertEquals(history[0].monthlyActivityVerified, false);
});

Deno.test('raw source keeps zero distinct from a blank parsed operational value', () => {
  const row = performanceSourceRows([{ member_id: 'member', rg: 0, one_to_one: 0,
    source_values: { rg: 0, one_to_one: null, tyfcb_thb: 0 } }],
    'reporting2you', 'chapter', 'batch', { year: 2026, month: 9 })[0];
  assertEquals(row.referrals_given, 0);
  assertEquals(row.one_to_ones, null);
  assertEquals(row.tyfcb_given, 0);
});

Deno.test('only latest complete three-file reporting period is trusted', () => {
  const files = { trafficLightEvolution: 'hash1', memberTrafficLight: 'hash2', reporting2You: 'hash3' };
  const batches = [
    { id: 'apr', period_year: 2026, period_month: 4, status: 'completed', file_hashes: files, created_at: '2026-04-30' },
    { id: 'may', period_year: 2026, period_month: 5, status: 'completed_with_warnings', file_hashes: files, created_at: '2026-05-31' },
    { id: 'jun', period_year: 2026, period_month: 6, status: 'completed', file_hashes: files, created_at: '2026-06-30' },
    { id: 'jun-retry', period_year: 2026, period_month: 6, status: 'completed', file_hashes: files, created_at: '2026-07-01' },
    { id: 'jul', period_year: 2026, period_month: 7, status: 'completed', file_hashes: { memberTrafficLight: 'hash2' }, created_at: '2026-07-31' },
  ];
  const rows = [
    { period_year: 2026, period_month: 4, import_batch_id: 'apr', source_type: 'reporting2you', referrals_given: 0 },
    { period_year: 2026, period_month: 5, import_batch_id: 'may', source_type: 'reporting2you', referrals_given: 12 },
    { period_year: 2026, period_month: 6, import_batch_id: 'jun-retry', source_type: 'reporting2you', referrals_given: 21 },
    { period_year: 2026, period_month: 7, import_batch_id: 'jul', source_type: 'reporting2you', referrals_given: 25 },
  ];
  const result = trustedSourceSnapshotHistory(rows, batches);
  assertEquals(result.history.map(row => [row.period, row.referralsGiven]), [['2026-04', 0], ['2026-06', 21]]);
  assertEquals(result.periods.find(row => row.period === '2026-05')?.status, 'PARTIAL');
  assertEquals(result.periods.find(row => row.period === '2026-07')?.status, 'PARTIAL');
});

Deno.test('MTL-only historical batch trusts only its dated Member Traffic Light rows', () => {
  const batches = [{ id: 'mtl-batch', period_year: 2026, period_month: 8, status: 'completed',
    file_hashes: { memberTrafficLight: 'hash-mtl' }, quality_summary: { importMode: 'historical_backfill', sourceCoverage: 'member_traffic_light_only' }, created_at: '2026-09-01' }];
  const rows = [
    { period_year: 2026, period_month: 8, import_batch_id: 'mtl-batch', source_type: 'member_traffic_light', traffic_light_points: 0 },
    { period_year: 2026, period_month: 8, import_batch_id: 'mtl-batch', source_type: 'reporting2you', referrals_given: 99 },
  ];
  const result = trustedSourceSnapshotHistory(rows, batches);
  assertEquals(result.periods, [{ period: '2026-08', status: 'MTL_ONLY' }]);
  assertEquals(result.history.length, 1);
  assertEquals(result.history[0].trafficLightPoints, 0);
  assertEquals(result.history[0].source, 'member_traffic_light');
});
