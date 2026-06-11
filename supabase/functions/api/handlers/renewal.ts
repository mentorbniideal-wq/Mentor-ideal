// Handler: renewal — getRenewal, extendRenewal
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleRenewal(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getRenewal': {
      const role = String(p.role || '').toLowerCase();
      const TEAM_MAP: Record<string, string> = { toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP' };
      const teamName = TEAM_MAP[role] || null;

      // Join renewals → members
      const { data: rows, error } = await db
        .from('renewals')
        .select('expiry_date, extended_at, notes, member_id, members(name, nickname, mentor_team)')
        .order('expiry_date', { ascending: true });
      if (error) return errResponse(error.message);

      const today = new Date();
      const renewals = (rows || []).map((r: Record<string, unknown>) => {
        const m = r.members as Record<string, unknown>;
        if (!m) return null;
        if (teamName && String(m.mentor_team) !== teamName) return null;
        const expiry = new Date(String(r.expiry_date));
        const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
        return {
          name:     m.name,
          nick:     m.nickname,
          team:     m.mentor_team,
          expiry:   r.expiry_date,
          daysLeft,
          status:   daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'warning' : 'ok',
          extended: r.extended_at || null,
        };
      }).filter(Boolean);

      return jsonResponse({ ok: true, renewals });
    }

    case 'extendRenewal': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member } = await db.from('members').select('id').eq('name', memberName).single();
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);
      const memberId = String((member as Record<string, unknown>).id);

      // If newExpiry not provided, extend current expiry by 1 year (or from today if no record)
      let newExpiry = String(p.newExpiry || p.expiry || '').trim();
      if (!newExpiry) {
        const { data: existing } = await db.from('renewals').select('expiry_date').eq('member_id', memberId).maybeSingle();
        const baseDate = existing
          ? new Date(String((existing as Record<string, unknown>).expiry_date))
          : new Date();
        if (isNaN(baseDate.getTime())) baseDate.setTime(Date.now());
        baseDate.setFullYear(baseDate.getFullYear() + 1);
        newExpiry = baseDate.toISOString().split('T')[0];
      }

      const { error } = await db.from('renewals').upsert({
        member_id:   memberId,
        expiry_date: newExpiry,
        extended_at: new Date().toISOString(),
        notes: String(p.notes || ''),
      }, { onConflict: 'member_id' });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, newExpiry, newExpStr: newExpiry });
    }

    default:
      return errResponse(`Unknown renewal action: ${action}`);
  }
}
