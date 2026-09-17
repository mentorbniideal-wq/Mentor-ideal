import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveMsbPlanningYear } from './msb-planning-year.ts';

function dbWith(options: { memberChapter?: string; configuredYear?: number | null }) {
  return {
    from(table: string) {
      const state: Record<string, unknown> = {};
      const chain = {
        select() { return chain; },
        eq(key: string, value: unknown) { state[key] = value; return chain; },
        limit() { return chain; },
        async maybeSingle() {
          if (table === 'members') return { data: { chapter_id: options.memberChapter || null } };
          if (table === 'chapter_profiles') {
            if (options.memberChapter && state.id !== options.memberChapter) return { data: null };
            return { data: { msb_planning_year: options.configuredYear ?? null } };
          }
          return { data: null };
        },
      };
      return chain;
    },
  };
}

Deno.test('Blueprint planning year follows the linked member Chapter', async () => {
  const year = await resolveMsbPlanningYear(dbWith({ memberChapter: 'ideal', configuredYear: 2027 }), {
    memberId: 'member-1',
    fallbackYear: 2026,
  });
  assertEquals(year, 2027);
});

Deno.test('Blueprint planning year has a safe calendar fallback', async () => {
  const year = await resolveMsbPlanningYear(dbWith({ configuredYear: null }), { fallbackYear: 2026 });
  assertEquals(year, 2026);
});
