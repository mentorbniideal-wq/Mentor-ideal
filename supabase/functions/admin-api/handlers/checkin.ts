import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAdminCheckin(p: Record<string, unknown>): Promise<Response> {
  const db   = getServiceClient();
  const auth = await requireAuth(db, p);
  if (!auth.ok) return errResponse(auth.error!);
  if (!auth.isMC) return errResponse('Admin access required', 403);

  const action = String(p.action);

  // ── List checkin sessions ─────────────────────────────────────
  if (action === 'getAdminCheckinSessions') {
    const { data: sessions, error } = await db
      .from('checkin_sessions')
      .select('id, week_label, meeting_date, imported_at')
      .order('meeting_date', { ascending: false })
      .limit(52);
    if (error) return errResponse(error.message);

    // Count entries per session
    const ids = (sessions || []).map((s: Record<string, unknown>) => String(s.id));
    let countMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: entries } = await db.from('checkin_entries').select('session_id').in('session_id', ids);
      for (const e of (entries || []) as Record<string, unknown>[]) {
        const sid = String(e.session_id);
        countMap[sid] = (countMap[sid] || 0) + 1;
      }
    }

    const list = ((sessions || []) as Record<string, unknown>[]).map(s => ({
      id:          s.id,
      weekLabel:   s.week_label,
      meetingDate: s.meeting_date,
      importedAt:  s.imported_at,
      count:       countMap[String(s.id)] || 0,
    }));
    return jsonResponse({ ok: true, sessions: list });
  }

  // ── Get entries for a session ─────────────────────────────────
  if (action === 'getAdminCheckinEntries') {
    const sessionId = String(p.sessionId || p.id || '').trim();
    if (!sessionId) return errResponse('sessionId required');

    const { data: entries, error } = await db
      .from('checkin_entries')
      .select('seq_no, raw_name, status, sub_for, looking_for, mentor_team')
      .eq('session_id', sessionId)
      .order('seq_no', { ascending: true });
    if (error) return errResponse(error.message);

    type EntryRow = { seq_no: number; raw_name: string; status: string; sub_for: string|null; looking_for: string|null; mentor_team: string|null };
    const present  = (entries || []).filter((e: EntryRow) => e.status === 'สมาชิก').length;
    const sub      = (entries || []).filter((e: EntryRow) => e.status === 'ตัวแทน').length;
    const visitor  = (entries || []).filter((e: EntryRow) => e.status === 'ผู้เยี่ยมชม').length;

    return jsonResponse({
      ok: true,
      entries: entries || [],
      stats: { present, sub, visitor, total: (entries || []).length },
    });
  }

  return errResponse(`Unknown checkin action: ${action}`);
}
