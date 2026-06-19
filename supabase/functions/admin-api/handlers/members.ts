import { requireAdminAccess } from '../../_shared/admin-auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAdminMembers(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action);
  const section = action === 'getAdminDashboard' ? 'dashboard' : 'members';
  const auth = await requireAdminAccess(db, p, section, {
    write: action === 'updateAdminMember',
  });
  if (!auth.ok) return errResponse(auth.error!);

  // ── Dashboard summary from v_member_dashboard ─────────────────
  if (action === 'getAdminDashboard') {
    const { data, error } = await db
      .from('v_member_dashboard')
      .select('name, nickname, mentor_team, display_score, traffic_light, absent, open_core_issue')
      .eq('is_archived', false)
      .order('display_score', { ascending: false });
    if (error) return errResponse(error.message);

    const members = (data || []) as Record<string, unknown>[];
    const total   = members.length;
    const critical = members.filter(m => m.traffic_light === 'black' || m.traffic_light === 'red').length;
    const watch    = members.filter(m => m.traffic_light === 'yellow').length;
    const normal   = members.filter(m => m.traffic_light === 'green').length;

    // Group by team
    const teams: Record<string, unknown[]> = {};
    for (const m of members) {
      const t = String(m.mentor_team || 'ไม่มีทีม');
      if (!teams[t]) teams[t] = [];
      teams[t].push({
        name:      m.name,
        nick:      m.nickname,
        team:      m.mentor_team,
        score:     m.display_score,
        tl:        m.traffic_light,
        absent:    m.absent,
        hasIssue:  !!m.open_core_issue,
      });
    }

    return jsonResponse({ ok: true, summary: { total, critical, watch, normal }, teams, members });
  }

  // ── Member list from growth_referral_members ──────────────────
  if (action === 'getAdminMembers') {
    const { data, error } = await db
      .from('growth_referral_members')
      .select(`
        id, seq_no, name, nickname, target_thb, received_thb, note,
        group_id, growth_referral_groups(name)
      `)
      .order('seq_no', { ascending: true });
    if (error) return errResponse(error.message);

    const rows = (data || []) as Record<string, unknown>[];
    const members = rows.map(r => {
      const target   = Number(r.target_thb)   || 0;
      const received = Number(r.received_thb) || 0;
      const pct = target > 0 ? Math.round(received / target * 100) : 0;
      const crisis = pct >= 80 ? 'normal' : pct >= 40 ? 'watch' : 'critical';
      const grp = r.growth_referral_groups as Record<string, unknown> | null;
      return {
        id: r.id, seqNo: r.seq_no, name: r.name, nick: r.nickname,
        target, received, pct, note: r.note || '',
        group: grp?.name || '', groupId: r.group_id, crisis,
      };
    });
    return jsonResponse({ ok: true, members });
  }

  // ── Update growth_referral_members row ────────────────────────
  if (action === 'updateAdminMember') {
    const id = String(p.id || '').trim();
    if (!id) return errResponse('id required');

    const updates: Record<string, unknown> = {};
    if (p.nickname   !== undefined) updates.nickname    = p.nickname;
    if (p.target_thb !== undefined) updates.target_thb  = Number(p.target_thb)   || 0;
    if (p.received_thb !== undefined) updates.received_thb = Number(p.received_thb) || 0;
    if (p.note       !== undefined) updates.note        = p.note;

    const { error } = await db.from('growth_referral_members').update(updates).eq('id', id);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  return errResponse(`Unknown members action: ${action}`);
}
