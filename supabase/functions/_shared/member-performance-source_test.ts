import { assertEquals } from 'jsr:@std/assert';
import { performanceSourceRows, sourceSnapshotHistory } from './member-performance-source.ts';

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
