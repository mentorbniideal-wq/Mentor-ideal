import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canBackfillMonthlyHistory, prepareHistoricalBackfill } from './growth.ts';

Deno.test('historical backfill requires verified owner/admin OAuth, not Growth capability or PIN', () => {
  assertEquals(canBackfillMonthlyHistory({ ok: true, email: 'admin@example.test', role: 'admin', isAdmin: true }), true);
  assertEquals(canBackfillMonthlyHistory({ ok: true, email: 'growth@example.test', role: 'growth', capabilities: ['growth.monthly_sync.execute'] }), false);
  assertEquals(canBackfillMonthlyHistory({ ok: true, role: 'admin', isAdmin: true }), false);
  assertEquals(canBackfillMonthlyHistory({ ok: true, email: 'admin@example.test', isAdmin: true, isReadOnly: true }), false);
  assertEquals(canBackfillMonthlyHistory({ ok: true, email: 'admin@example.test', isAdmin: true, isViewer: true }), false);
  assertEquals(canBackfillMonthlyHistory({ ok: false, email: 'admin@example.test', isAdmin: true }), false);
});

const db = {
  from(table: string) {
    assertEquals(table, 'members', 'backfill preparation never writes current member tables');
    return { select() { return { eq() { return Promise.resolve({ data: [{ id: 'stable-member-id', name: 'Alice Example', nickname: '' }], error: null }); } }; } };
  },
} as never;

const files = {
  reportingPeriod: '2026-08',
  memberTLCsv: "BNI Ideal : Member Traffic Lights Aug'26\nNo,Name -Surname,Traffic Light,Total Score,Value of Business Given (Baht),Value of Business Received (Baht)\n1,Alice Example,Green,0,0,0",
  sourceFiles: { memberTrafficLight: 'member.csv' },
};

Deno.test('historical backfill prepares only matched source snapshots and retains reported zero', async () => {
  const prepared = await prepareHistoricalBackfill(db, 'chapter-a', files);
  assertEquals(prepared.periodKey, '2026-08');
  assertEquals(prepared.quality.memberTrafficLightRows, 1);
  assertEquals(prepared.quality.sourceCoverage, 'member_traffic_light_only');
  assertEquals(Object.keys(prepared.fileHashes), ['memberTrafficLight']);
  assertEquals(prepared.mtl[0].member_id, 'stable-member-id');
  assertEquals(prepared.mtl[0].score, 0);
  assertEquals(prepared.mtl[0].source_values.score, 0);
  assertEquals(prepared.mtl[0].source_values.rg, null);
  assertEquals(prepared.quality.importMode, 'historical_backfill');
});

Deno.test('historical report skips unlinked former names without inventing member IDs', async () => {
  const prepared = await prepareHistoricalBackfill(db, 'chapter-a', {
    ...files, memberTLCsv: files.memberTLCsv + '\n2,Former Example,Green,42,100,200',
  });
  assertEquals(prepared.mtl.length, 1);
  assertEquals(prepared.mtl[0].member_id, 'stable-member-id');
  assertEquals(prepared.quality.unmatchedRows, 1);
  assertEquals(prepared.unmatchedNames, ['former example']);
  assertEquals(prepared.memberIds, ['stable-member-id']);
});

Deno.test('preview token changes if the stable-ID resolution changes before confirmation', async () => {
  const csv = files.memberTLCsv + '\n2,Former Example,Green,42,100,200';
  const first = await prepareHistoricalBackfill(db, 'chapter-a', { ...files, memberTLCsv: csv });
  const alternateDb = { from() { return { select() { return { eq() { return Promise.resolve({ data: [
    { id: 'former-member-id', name: 'Former Example', nickname: '' },
  ], error: null }); } }; } }; } } as never;
  const second = await prepareHistoricalBackfill(alternateDb, 'chapter-a', { ...files, memberTLCsv: csv });
  assertEquals(first.mtl.length, second.mtl.length);
  assert(first.previewToken !== second.previewToken);
});

Deno.test('historical backfill fails closed on missing or mismatched sources', async () => {
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, memberTLCsv: '' }), Error, 'Member Traffic Light');
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, reportingPeriod: '2026-07' }), Error);
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, tlCsv: 'today-only' }), Error, 'ไม่ใช่รายงานย้อนหลัง');
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, r2yCsv: 'today-only' }), Error, 'ไม่ใช่รายงานย้อนหลัง');
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, memberTLCsv: files.memberTLCsv.replace('Alice Example', 'Unknown Member') }), Error, 'ไม่มีข้อมูลสมาชิกที่จับคู่ได้');
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, memberTLCsv: files.memberTLCsv.replace("Member Traffic Lights Aug'26", 'Member Traffic Lights') }), Error, 'ไม่ระบุเดือน');
});
