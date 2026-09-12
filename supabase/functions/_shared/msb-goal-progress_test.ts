import { annualGoalProgress } from './msb-goal-progress.ts';
const assertEquals = (actual: unknown, expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); };

Deno.test('annual goal progress recommends review only when actual exceeds a valid goal', () => {
  assertEquals(annualGoalProgress(3000000, 3771255), { target: 3000000, actual: 3771255, progressPercent: 125.7085, exceeded: true });
  assertEquals(annualGoalProgress(0, 3771255), { target: 0, actual: 3771255, progressPercent: null, exceeded: false });
});
