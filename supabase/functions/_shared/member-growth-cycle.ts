export function parseDateOnly(value: unknown): Date | null {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
}

export function membershipFacts(member: { joined_date?: unknown; membership_start_date?: unknown }, renewal: { expiry_date?: unknown; completed_at?: unknown; extended_at?: unknown } | null, today: string) {
  const joined = parseDateOnly(member.joined_date);
  const chapterStart = parseDateOnly(member.membership_start_date);
  const todayDate = parseDateOnly(today);
  const validJoined = joined && todayDate && joined <= todayDate ? joined : null;
  const validChapterStart = chapterStart && todayDate && chapterStart <= todayDate ? chapterStart : null;
  // A BNI join date cannot be later than the recorded current-Chapter start.
  // In that inconsistent case report only the Chapter tenure, without silently rewriting either date.
  const start = validJoined && (!validChapterStart || validJoined <= validChapterStart) ? validJoined : validChapterStart;
  const startSource = start === joined ? 'bni_joined_date' : start ? 'chapter_start_date' : null;
  const lastRenewal = [renewal?.completed_at, renewal?.extended_at]
    .map(value => String(value || '').slice(0, 10))
    .filter(value => Boolean(parseDateOnly(value)) && value <= today)
    .sort().at(-1) || null;
  return {
    membershipStartDate: start?.toISOString().slice(0, 10) || null,
    membershipStartSource: startSource,
    membershipDays: start && todayDate ? Math.floor((todayDate.getTime() - start.getTime()) / 86400000) : null,
    lastRenewedOn: todayDate ? lastRenewal : null,
    expiryDate: parseDateOnly(renewal?.expiry_date)?.toISOString().slice(0, 10) || null,
  };
}

export function monthDueDate(expiry: string, monthNumber: number): string | null {
  const date = parseDateOnly(expiry);
  if (!date || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthNumber - 12, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

export function cycleMonth(expiry: string, today: string): number | null {
  if (!parseDateOnly(today) || !parseDateOnly(expiry)) return null;
  for (let month = 2; month <= 12; month++) {
    const due = monthDueDate(expiry, month);
    if (due && today < due) return month - 1;
  }
  return 12;
}

export function growthMilestone(month: number, isNew: boolean): { label: string; owner: string } | null {
  if (month === 1) return { label: 'เริ่มรอบ / ตั้งเป้า', owner: 'Growth' };
  if (month === 3 && isNew) return { label: 'New Member Review', owner: 'Mentor' };
  if (month === 6) return { label: 'เช็กผลเทียบเป้าหมาย', owner: 'Growth' };
  if (month === 9) return { label: 'ส่งสรุปก่อนหมดอายุ', owner: 'Growth → Membership Committee' };
  if (month === 12) return { label: 'วันหมดอายุ', owner: 'Membership Committee' };
  return null;
}

export function canReadGrowthCycle(subject: { email?: string }): boolean {
  return Boolean(subject.email);
}

export function canManageGrowthCycle(subject: { email?: string; isAdmin?: boolean; isReadOnly?: boolean; isViewer?: boolean; capabilities?: string[] }): boolean {
  if (!subject.email || subject.isReadOnly || subject.isViewer) return false;
  return Boolean(subject.isAdmin || (subject.capabilities || []).some(capability =>
    capability === '*' || capability === 'growth.coordinate'));
}

export function achievementPercent(actual: unknown, target: unknown): number | null {
  const a = Number(actual), t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || a < 0 || t <= 0) return null;
  return Math.round(a / t * 1000) / 10;
}

export function renewalCycleStatus(workflowStatus: unknown): 'Renewed' | 'Pending' | 'Not Renewed' | 'Unknown' {
  const status = String(workflowStatus || '');
  if (status === 'completed') return 'Renewed';
  if (status === 'declined') return 'Not Renewed';
  return status ? 'Pending' : 'Unknown';
}

export function todayInZone(timezone: string, instant = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
