/** Goal used to measure actuals for a reporting year, never a future MSB plan. */
export function reportingGoal(
  reportingYear: number,
  planningYear: number,
  legacyTarget: number,
  submittedGoal: number | null,
): number {
  return planningYear === reportingYear && submittedGoal !== null ? submittedGoal : legacyTarget;
}

/** A revoked or absent referral-focus grant exposes only explicitly consented categories. */
export function visibleGrowthCategories(
  categories: unknown,
  shared: boolean,
  explicitlyAllowed: ReadonlySet<string> | undefined,
): string[] {
  if (!Array.isArray(categories)) return [];
  return categories.map(String).filter(category => shared || explicitlyAllowed?.has(category.toLowerCase()));
}
