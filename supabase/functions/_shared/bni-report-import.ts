export function palmsPeriodDays(
  periodFrom: string | null,
  periodTo: string | null,
): number | null {
  if (!periodFrom || !periodTo) return null;
  const from = Date.parse(`${periodFrom}T00:00:00Z`);
  const to = Date.parse(`${periodTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.floor((to - from) / 86_400_000) + 1;
}

// Operational cards should represent a current reporting window. Longer BNI
// Connect exports remain valuable history, but their cumulative totals must not
// overwrite current R2Y/PALMS dashboard values.
export function shouldUpdateCurrentPalms(
  periodFrom: string | null,
  periodTo: string | null,
  maxOperationalDays = 400,
): boolean {
  const days = palmsPeriodDays(periodFrom, periodTo);
  return days != null && days <= maxOperationalDays;
}
