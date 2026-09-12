import { calculateMsbGoal } from './msb-goal-calculation.ts';
const assertEquals = (actual: unknown, expected: unknown) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); };

Deno.test('MSB calculation uses new revenue only for customer and referral demand', () => {
  assertEquals(calculateMsbGoal({ existingCustomerRevenue: 300000, newCustomerRevenue: 600000, annualCustomerValue: 60000, conversionRatePercent: 40 }), { totalExpectedBniRevenue: 900000, requiredCustomers: 10, requiredReferrals: 25, referralsPerMonth: 25 / 12, referralsPerWeek: 25 / 52 });
});
Deno.test('MSB calculation never returns NaN or Infinity for incomplete inputs', () => {
  assertEquals(calculateMsbGoal({ newCustomerRevenue: 600000, annualCustomerValue: 0, conversionRatePercent: 0 }), { totalExpectedBniRevenue: 600000, requiredCustomers: 0, requiredReferrals: 0, referralsPerMonth: 0, referralsPerWeek: 0 });
});
