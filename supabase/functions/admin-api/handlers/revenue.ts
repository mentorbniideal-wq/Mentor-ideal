import { requireAdminAccess } from '../../_shared/admin-auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAdminRevenue(p: Record<string, unknown>): Promise<Response> {
  const db   = getServiceClient();
  const action = String(p.action);
  const auth = await requireAdminAccess(db, p, 'revenue', {
    write: action !== 'getAdminRevenue',
  });
  if (!auth.ok) return errResponse(auth.error!);

  if (action === 'getAdminRevenue') {
    const { data, error } = await db
      .from('chapter_revenue_goals')
      .select('id, year, month, goal_thb, note, created_at')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(24);
    if (error) return errResponse(error.message);

    const MONTHS = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const goals = ((data || []) as Record<string, unknown>[]).map(r => ({
      id: r.id, year: r.year, month: r.month,
      monthLabel: MONTHS[Number(r.month)] || String(r.month),
      goalThb: Number(r.goal_thb) || 0,
      note: r.note || '', createdAt: r.created_at,
    }));
    return jsonResponse({ ok: true, goals });
  }

  if (action === 'saveAdminRevenue') {
    const year    = Number(p.year)  || new Date().getFullYear();
    const month   = Number(p.month) || new Date().getMonth() + 1;
    const goalThb = Number(p.goalThb || p.goal_thb) || 0;
    const note    = String(p.note || '').trim();
    const period  = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;

    const { data: existing, error: findError } = await db
      .from('chapter_revenue_goals')
      .select('id')
      .eq('year', year)
      .eq('month', month)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) return errResponse(findError.message);

    const row = {
      year,
      month,
      goal_thb: goalThb,
      note,
      goal_type: 'tyfcb',
      target: goalThb,
      period,
      updated_at: new Date().toISOString(),
    };

    const existingId = existing ? String((existing as Record<string, unknown>).id) : '';
    const { error } = existingId
      ? await db.from('chapter_revenue_goals').update(row).eq('id', existingId)
      : await db.from('chapter_revenue_goals').insert(row);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'deleteAdminRevenue') {
    const id = String(p.id || '').trim();
    if (!id) return errResponse('id required');
    const { error } = await db.from('chapter_revenue_goals').delete().eq('id', id);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  return errResponse(`Unknown revenue action: ${action}`);
}
