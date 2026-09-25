export type CustomLineRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

function addUtcMonth(value: number): number {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  date.setUTCFullYear(year, month + 1, Math.min(day, lastDay));
  return date.getTime();
}

export function nextCustomLineRun(
  recurrence: CustomLineRecurrence,
  scheduledFor: string,
  now = new Date(),
): { enabled: boolean; nextRunAt: string } {
  const scheduledMs = new Date(scheduledFor).getTime();
  if (!Number.isFinite(scheduledMs)) throw new Error('Invalid scheduled time');
  if (recurrence === 'once') return { enabled: false, nextRunAt: new Date(scheduledMs).toISOString() };
  let nextMs = recurrence === 'monthly' ? addUtcMonth(scheduledMs)
    : scheduledMs + (recurrence === 'daily' ? 86400000 : 7 * 86400000);
  while (nextMs <= now.getTime()) nextMs = recurrence === 'monthly' ? addUtcMonth(nextMs)
    : nextMs + (recurrence === 'daily' ? 86400000 : 7 * 86400000);
  return { enabled: true, nextRunAt: new Date(nextMs).toISOString() };
}
