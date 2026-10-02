import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** PostgREST caps a response at 1,000 rows. Never treat the first page as full history. */
export async function fetchMonthlyScorePages(
  db: SupabaseClient,
  memberIds: string[],
  columns: '*' | 'member_id,score,year,month' = 'member_id,score,year,month',
): Promise<Record<string, unknown>[]> {
  if (!memberIds.length) return [];
  const pageSize = 500;
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await db.from('monthly_scores').select(columns)
      .in('member_id', memberIds)
      .order('year', { ascending: true })
      .order('month', { ascending: true })
      .order('member_id', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
