type Db = {
  from: (table: string) => any;
};

function validYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null;
}

export async function resolveMsbPlanningYear(
  db: Db,
  options: { memberId?: string; chapterId?: string; fallbackYear?: number } = {},
): Promise<number> {
  const fallback = validYear(options.fallbackYear) || new Date().getFullYear();
  let chapterId = String(options.chapterId || '').trim();

  if (!chapterId && options.memberId) {
    const { data } = await db.from('members')
      .select('chapter_id')
      .eq('id', options.memberId)
      .maybeSingle();
    chapterId = String((data as Record<string, unknown> | null)?.chapter_id || '');
  }

  let query = db.from('chapter_profiles').select('msb_planning_year').eq('is_active', true);
  if (chapterId) query = query.eq('id', chapterId);
  const { data } = await query.limit(1).maybeSingle();
  return validYear((data as Record<string, unknown> | null)?.msb_planning_year) || fallback;
}
