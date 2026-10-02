import { assertEquals, assertRejects } from 'jsr:@std/assert';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchMonthlyScorePages } from './monthly-score-pages.ts';

function mockScores(total: number, failAt = -1) {
  const ranges: number[] = [];
  const db = {
    from(table: string) {
      assertEquals(table, 'monthly_scores');
      return {
        select() { return this; },
        in() { return this; },
        order() { return this; },
        range(start: number, end: number) {
          ranges.push(start);
          return Promise.resolve(start === failAt
            ? { data: null, error: { message: 'page failed' } }
            : { data: Array.from({ length: Math.max(0, Math.min(end + 1, total) - start) }, (_, i) => ({ member_id: 'member', score: start + i, year: 2026, month: 9 })), error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, ranges };
}

Deno.test('monthly score history reads beyond the PostgREST row cap', async () => {
  const { db, ranges } = mockScores(1201);
  const rows = await fetchMonthlyScorePages(db, ['member']);
  assertEquals(rows.length, 1201);
  assertEquals(rows[1200].score, 1200);
  assertEquals(ranges, [0, 500, 1000]);
});

Deno.test('monthly score history fails closed if a later page fails', async () => {
  const { db } = mockScores(1201, 500);
  await assertRejects(() => fetchMonthlyScorePages(db, ['member']), Error, 'page failed');
});

Deno.test('monthly score history skips queries for empty member scope', async () => {
  const { db, ranges } = mockScores(1201);
  assertEquals(await fetchMonthlyScorePages(db, []), []);
  assertEquals(ranges, []);
});
