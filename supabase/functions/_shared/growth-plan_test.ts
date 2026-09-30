import { assertEquals } from 'jsr:@std/assert';
import { reportingGoal, visibleGrowthCategories } from './growth-plan.ts';

Deno.test('future MSB goal never becomes current-year reporting target', () => {
  assertEquals(reportingGoal(2026, 2027, 100_000, 250_000), 100_000);
  assertEquals(reportingGoal(2027, 2027, 100_000, 250_000), 250_000);
  assertEquals(reportingGoal(2027, 2027, 100_000, 0), 0);
  assertEquals(reportingGoal(2027, 2027, 100_000, null), 100_000);
});

Deno.test('Growth categories require shared focus or exact category consent', () => {
  const categories = ['Health', 'Retail'];
  assertEquals(visibleGrowthCategories(categories, false, undefined), []);
  assertEquals(visibleGrowthCategories(categories, false, new Set(['health'])), ['Health']);
  assertEquals(visibleGrowthCategories(categories, true, undefined), categories);
});
