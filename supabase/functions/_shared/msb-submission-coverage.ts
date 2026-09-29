export type BlueprintCoverageMember = {
  memberId: string;
  name: string;
  nickname: string;
  years: Array<{ year: number; status: 'submitted' | 'draft'; updatedAt: string | null }>;
};

type MemberRow = { id?: unknown; name?: unknown; nickname?: unknown; [key: string]: unknown };
type BlueprintRow = { member_id?: unknown; blueprint_year?: unknown; source?: unknown; status?: unknown; updated_at?: unknown; [key: string]: unknown };

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function preferPlanningBlueprint<T extends BlueprintRow>(current: T | undefined, candidate: T): T {
  if (!current) return candidate;
  const score = (row: T) => (text(row.status) === 'submitted' ? 2 : 0) + (Number(row.blueprint_year) === 2027 ? 1 : 0);
  return score(candidate) > score(current) ? candidate : current;
}

export function buildBlueprintSubmissionCoverage(
  members: MemberRow[],
  blueprints: BlueprintRow[],
  focusYear: number,
) {
  const memberIds = new Set(members.map(member => text(member.id)).filter(Boolean));
  const byMember = new Map<string, BlueprintCoverageMember['years']>();
  const years = new Set<number>();
  if (Number.isInteger(focusYear) && focusYear > 0) years.add(focusYear);

  for (const row of blueprints) {
    const memberId = text(row.member_id);
    // The 2026 MSB intake was an early version of the 2027 member form.
    // Historical 2026 Growth targets live in member_annual_growth_goals,
    // never in this table. Keep the original year in storage for audit.
    const storedYear = Number(row.blueprint_year);
    const year = focusYear === 2027 && storedYear === 2026 && text(row.source) === 'member_form_2026_superseded' ? 2027 : storedYear;
    if (!memberIds.has(memberId) || !Number.isInteger(year) || year <= 0) continue;
    const status = text(row.status) === 'submitted' ? 'submitted' : 'draft';
    years.add(year);
    const entries = byMember.get(memberId) || [];
    const incoming: BlueprintCoverageMember['years'][number] = { year, status, updatedAt: text(row.updated_at) || null };
    const existing = entries.findIndex(entry => entry.year === year);
    if (existing < 0) entries.push(incoming);
    else if (incoming.status === 'submitted' && entries[existing].status !== 'submitted') entries[existing] = incoming;
    else if (incoming.status === entries[existing].status && String(incoming.updatedAt || '') > String(entries[existing].updatedAt || '')) entries[existing] = incoming;
    byMember.set(memberId, entries);
  }

  const availableYears = [...years].sort((a, b) => b - a);
  const memberRows: BlueprintCoverageMember[] = members.map(member => {
    const memberId = text(member.id);
    const entries = (byMember.get(memberId) || [])
      .sort((a, b) => b.year - a.year || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return {
      memberId,
      name: text(member.name),
      nickname: text(member.nickname),
      years: entries,
    };
  });

  const byYear = availableYears.map(year => {
    let submitted = 0;
    let draft = 0;
    for (const member of memberRows) {
      const entry = member.years.find(item => item.year === year);
      if (entry?.status === 'submitted') submitted += 1;
      else if (entry?.status === 'draft') draft += 1;
    }
    return {
      year,
      totalMembers: memberRows.length,
      submitted,
      draft,
      missing: Math.max(0, memberRows.length - submitted - draft),
    };
  });

  return { availableYears, byYear, members: memberRows };
}
