import { assertEquals } from 'jsr:@std/assert';
import { authorizeGrowthLineSender, projectGrowthLinePowerTeamDraft } from './handlers/growth.ts';
import type { AuthResult } from '../_shared/auth.ts';
import type { getServiceClient } from '../_shared/db.ts';

function fixtureDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    lt_terms: [{ id: 'TEST_term_A', chapter_id: 'TEST_A', status: 'active', starts_on: '2000-01-01', ends_on: '2100-01-01' }],
    lt_growth_team_members: [
      { chapter_id: 'TEST_A', term_id: 'TEST_term_A', member_id: 'TEST_lead_A', position: 'lead' },
      { chapter_id: 'TEST_B', term_id: 'TEST_term_A', member_id: 'TEST_lead_B', position: 'lead' },
    ],
  };
  return { from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      lte(key: string, value: string) { filters.push(row => String(row[key]) <= value); return query; },
      gte(key: string, value: string) { filters.push(row => String(row[key]) >= value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: (tables[table] || []).filter(row => filters.every(filter => filter(row))), error: null }).then(resolve); },
      maybeSingle() { return Promise.resolve({ data: (tables[table] || []).filter(row => filters.every(filter => filter(row)))[0] || null, error: null }); },
    };
    return query;
  } } as unknown as ReturnType<typeof getServiceClient>;
}

Deno.test('Growth LINE sender requires current Chapter LT roster and OAuth identity', async () => {
  const db = fixtureDb();
  const lead: AuthResult = { ok: true, role: 'growth', email: 'test_lead@example.invalid', memberId: 'TEST_lead_A' };
  assertEquals(await authorizeGrowthLineSender(db, lead, 'TEST_A'), null);
  assertEquals(await authorizeGrowthLineSender(db, { ...lead, memberId: 'TEST_lead_B' }, 'TEST_A'), 'บัญชีนี้ไม่ได้เป็น Growth Lead/Co-Lead ในวาระปัจจุบัน');
  assertEquals(await authorizeGrowthLineSender(db, { ...lead, memberId: 'TEST_member_A' }, 'TEST_A'), 'บัญชีนี้ไม่ได้เป็น Growth Lead/Co-Lead ในวาระปัจจุบัน');
  assertEquals(await authorizeGrowthLineSender(db, { ...lead, email: undefined }, 'TEST_A'), 'เฉพาะ Growth Lead/Co-Lead ที่เข้าสู่ระบบด้วย Google เท่านั้น');
  assertEquals(await authorizeGrowthLineSender(db, { ...lead, role: 'mc' }, 'TEST_A'), 'เฉพาะ Growth Lead/Co-Lead ที่เข้าสู่ระบบด้วย Google เท่านั้น');
  assertEquals(await authorizeGrowthLineSender(db, { ...lead, isReadOnly: true }, 'TEST_A'), 'เฉพาะ Growth Lead/Co-Lead ที่เข้าสู่ระบบด้วย Google เท่านั้น');
});

Deno.test('Power Team draft uses only current share permission or active explicit category consent', () => {
  const categories = ['TEST_Category A', 'TEST_Category B'];
  assertEquals(projectGrowthLinePowerTeamDraft(categories, false, true, new Set()), []);
  assertEquals(projectGrowthLinePowerTeamDraft(categories, true, false, new Set()), []);
  assertEquals(projectGrowthLinePowerTeamDraft(categories, true, false, new Set(['testcategorya'])), ['TEST_Category A']);
  assertEquals(projectGrowthLinePowerTeamDraft(categories, true, false, new Set()), []); // next request after revoke
  assertEquals(projectGrowthLinePowerTeamDraft(categories, true, true, new Set()), categories);
});
