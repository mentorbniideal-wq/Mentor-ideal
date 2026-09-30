const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** The Member Traffic Light title identifies the current report month. Evolution columns are historical. */
export function memberTrafficLightReportPeriod(rows: string[][]): string | null {
  const title = rows.slice(0, 3).flat().find(value => /member\s+traffic\s+lights?/i.test(value));
  const match = title?.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'’\-/]*(\d{2}|20\d{2})\b/i);
  if (!match) return null;
  const year = Number(match[2]);
  return `${year < 100 ? year + 2000 : year}-${String(MONTHS[match[1].toLowerCase()]).padStart(2, '0')}`;
}

export function evolutionIsHistorical(periods: string[], requestedPeriod: string): boolean {
  return periods.every(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= requestedPeriod);
}

/** A reported zero is data, whereas a blank/invalid score is missing. */
export function reportedNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const score = Number(raw.replace(/[\s,฿$]/g, ''));
  return Number.isFinite(score) && score >= 0 ? score : null;
}

export const reportedScore = reportedNumber;
