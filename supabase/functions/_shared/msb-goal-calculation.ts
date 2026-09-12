export type MsbGoalCalculation = {
  totalExpectedBniRevenue: number;
  requiredCustomers: number;
  requiredReferrals: number;
  referralsPerMonth: number;
  referralsPerWeek: number;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(String(value ?? '').replace(/[,฿\s]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** Only new BNI revenue creates a new-customer/referral need. */
export function calculateMsbGoal(input: {
  existingCustomerRevenue?: unknown;
  newCustomerRevenue?: unknown;
  annualCustomerValue?: unknown;
  conversionRatePercent?: unknown;
}): MsbGoalCalculation {
  const existing = numberValue(input.existingCustomerRevenue);
  const newRevenue = numberValue(input.newCustomerRevenue);
  const annualValue = numberValue(input.annualCustomerValue);
  const conversion = numberValue(input.conversionRatePercent);
  const requiredCustomers = annualValue > 0 ? Math.ceil(newRevenue / annualValue) : 0;
  const requiredReferrals = conversion > 0 ? Math.ceil(requiredCustomers / (conversion / 100)) : 0;
  return { totalExpectedBniRevenue: existing + newRevenue, requiredCustomers, requiredReferrals, referralsPerMonth: requiredReferrals / 12, referralsPerWeek: requiredReferrals / 52 };
}
