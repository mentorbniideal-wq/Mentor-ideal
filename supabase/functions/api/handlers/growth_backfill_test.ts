import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { prepareHistoricalBackfill } from './growth.ts';

const db = {
  from(table: string) {
    assertEquals(table, 'members', 'backfill preparation never writes current member tables');
    return { select() { return { eq() { return Promise.resolve({ data: [{ id: 'stable-member-id', name: 'Alice Example', nickname: '' }], error: null }); } }; } };
  },
} as never;

const files = {
  reportingPeriod: '2026-08',
  tlCsv: 'Name,08/2026\nAlice Example,0',
  memberTLCsv: "BNI Ideal : Member Traffic Lights Aug'26\nNo,Name -Surname,Traffic Light,Total Score,Value of Business Given (Baht),Value of Business Received (Baht)\n1,Alice Example,Green,0,0,0",
  r2yCsv: 'Name,RG,RR,Unnamed,121,CEU,TYFCB,Points\nAlice Example,0,0,,0,0,0,0',
  sourceFiles: { trafficLightEvolution: 'evolution.csv', memberTrafficLight: 'member.csv', reporting2You: 'r2y.csv' },
};

Deno.test('historical backfill prepares only matched source snapshots and retains reported zero', async () => {
  const prepared = await prepareHistoricalBackfill(db, 'chapter-a', files);
  assertEquals(prepared.periodKey, '2026-08');
  assertEquals(prepared.quality.evolutionRows, 1);
  assertEquals(prepared.quality.memberTrafficLightRows, 1);
  assertEquals(prepared.quality.reporting2YouRows, 1);
  assertEquals(prepared.mtl[0].member_id, 'stable-member-id');
  assertEquals(prepared.mtl[0].score, 0);
  assertEquals(prepared.quality.importMode, 'historical_backfill');
});

Deno.test('historical backfill fails closed on missing or mismatched sources', async () => {
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, r2yCsv: '' }), Error, 'ครบทั้ง 3');
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, reportingPeriod: '2026-07' }), Error);
  await assertRejects(() => prepareHistoricalBackfill(db, 'chapter-a', { ...files, r2yCsv: 'Name,RG\nUnknown Member,1' }), Error, 'stable ID');
});
