export type BlueprintCoverageMember = {
  memberId: string;
  name: string;
  nickname: string;
  years: Array<{ year: number; status: 'submitted' | 'draft'; updatedAt: string | null }>;
};

type MemberRow = { id?: unknown; name?: unknown; nickname?: unknown; [key: string]: unknown };
type BlueprintRow = { member_id?: unknown; blueprint_year?: unknown; status?: unknown; updated_at?: unknown; [key: string]: unknown };

function text(value: unknown): string {
  return String(value ?? '').trim();
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
    const year = Number(row.blueprint_year);
    if (!memberIds.has(memberId) || !Number.isInteger(year) || year <= 0) continue;
    const status = text(row.status) === 'submitted' ? 'submitted' : 'draft';
    years.add(year);
    const entries = byMember.get(memberId) || [];
    entries.push({ year, status, updatedAt: text(row.updated_at) || null });
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
