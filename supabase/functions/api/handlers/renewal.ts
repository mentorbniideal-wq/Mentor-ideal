// Handler: renewal — getRenewal, updateRenewalStatus, extendRenewal
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const TEAM_MAP: Record<string, string> = {
  toomtam: 'TOOMTAM',
  aof: 'Aof',
  draft: 'Draft',
  phai: 'PHAI',
  amp: 'AMP',
};

const RENEWAL_STATUSES = new Set([
  'pending_contact',
  'contacted',
  'confirmed_renew',
  'paid',
  'completed',
  'declined',
]);

const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending_contact: new Set(['contacted']),
  contacted: new Set(['pending_contact', 'confirmed_renew', 'declined']),
  confirmed_renew: new Set(['contacted', 'paid', 'declined']),
  paid: new Set(['confirmed_renew', 'completed', 'declined']),
  completed: new Set([]),
  declined: new Set(['pending_contact']),
};

function addOneYear(dateText: string): string {
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0];
}

export async function handleRenewal(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getRenewal': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const role = String(auth.role || p.role || '').toLowerCase();
      const teamName = TEAM_MAP[role] || null;

      // Join renewals → members
      const { data: rows, error } = await db
        .from('renewals')
        .select('id, expiry_date, extended_at, notes, member_id, workflow_status, contacted_at, contacted_by, decision_at, decision_by, payment_at, payment_by, completed_at, completed_by, decline_reason, members(name, nickname, mentor_team)')
        .order('expiry_date', { ascending: true });
      if (error) return errResponse(error.message);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today.getTime() + 90 * 86400000);

      const items = (rows || []).map((r: Record<string, unknown>) => {
        const m = r.members as Record<string, unknown>;
        if (!m) return null;
        if (teamName && String(m.mentor_team) !== teamName) return null;
        const expiry = new Date(String(r.expiry_date));
        expiry.setHours(0, 0, 0, 0);
        const workflowStatus = String(r.workflow_status || 'pending_contact');
        if (workflowStatus === 'completed') return null;
        if (expiry.getTime() > maxDate.getTime() && workflowStatus !== 'declined') return null;
        const diffDays = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
        const expStr = String(r.expiry_date || '');
        return {
          id:       r.id,
          name:     m.name,
          nick:     m.nickname,
          team:     m.mentor_team,
          expiry:   r.expiry_date,
          expStr,
          diffDays,
          daysLeft: diffDays,
          status:   diffDays < 0 ? 'late' : diffDays <= 90 ? 'soon' : 'ok',
          extended: r.extended_at || null,
          workflowStatus,
          contactedAt: r.contacted_at || null,
          contactedBy: r.contacted_by || null,
          decisionAt: r.decision_at || null,
          decisionBy: r.decision_by || null,
          paymentAt: r.payment_at || null,
          paymentBy: r.payment_by || null,
          completedAt: r.completed_at || null,
          completedBy: r.completed_by || null,
          declineReason: r.decline_reason || '',
        };
      }).filter(Boolean);

      return jsonResponse({ ok: true, items, renewals: items });
    }

    case 'updateRenewalStatus': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      const nextStatus = String(p.status || '').trim();
      const reason = String(p.reason || '').trim();
      if (!memberName) return errResponse('memberName required');
      if (!RENEWAL_STATUSES.has(nextStatus)) return errResponse('สถานะ Renewal ไม่ถูกต้อง');
      if (nextStatus === 'declined' && !reason) return errResponse('กรุณาระบุเหตุผลที่ไม่ต่ออายุ');

      const { data: member, error: memberError } = await db
        .from('members')
        .select('id, name, nickname, mentor_team')
        .eq('name', memberName)
        .maybeSingle();
      if (memberError) return errResponse(memberError.message);
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const actorRole = String(auth.role || '').toLowerCase();
      const memberRow = member as Record<string, unknown>;
      const memberTeam = String(memberRow.mentor_team || '');
      const actorTeam = TEAM_MAP[actorRole] || '';
      if (actorTeam && actorTeam !== memberTeam) {
        return errResponse('ไม่มีสิทธิ์อัปเดต Renewal ของสมาชิกทีมอื่น');
      }

      const memberId = String(memberRow.id);
      const { data: renewal, error: renewalError } = await db
        .from('renewals')
        .select('id, expiry_date, workflow_status')
        .eq('member_id', memberId)
        .maybeSingle();
      if (renewalError) return errResponse(renewalError.message);
      if (!renewal) return errResponse('ไม่พบข้อมูล Renewal ของสมาชิกคนนี้');

      const current = renewal as Record<string, unknown>;
      const previousStatus = String(current.workflow_status || 'pending_contact');
      if (nextStatus === previousStatus) {
        return jsonResponse({
          ok: true,
          status: nextStatus,
          previousStatus,
          newExpiry: current.expiry_date,
        });
      }
      if (!ALLOWED_TRANSITIONS[previousStatus]?.has(nextStatus)) {
        return errResponse(`ไม่สามารถเปลี่ยนสถานะจาก ${previousStatus} ไป ${nextStatus} ได้`);
      }
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        workflow_status: nextStatus,
        updated_at: now,
      };

      if (nextStatus === 'pending_contact') {
        Object.assign(update, {
          contacted_at: null, contacted_by: null,
          decision_at: null, decision_by: null,
          payment_at: null, payment_by: null,
          completed_at: null, completed_by: null,
          decline_reason: null,
        });
      }
      if (nextStatus === 'contacted') {
        update.contacted_at = now;
        update.contacted_by = actorRole;
        update.decline_reason = null;
      }
      if (nextStatus === 'confirmed_renew') {
        update.decision_at = now;
        update.decision_by = actorRole;
        update.decline_reason = null;
      }
      if (nextStatus === 'paid') {
        update.payment_at = now;
        update.payment_by = actorRole;
      }
      if (nextStatus === 'completed') {
        const newExpiry = addOneYear(String(current.expiry_date || ''));
        if (!newExpiry) return errResponse('วันหมดอายุเดิมไม่ถูกต้อง');
        update.expiry_date = newExpiry;
        update.extended_at = now;
        update.completed_at = now;
        update.completed_by = actorRole;
      }
      if (nextStatus === 'declined') {
        update.decision_at = now;
        update.decision_by = actorRole;
        update.decline_reason = reason;
      }

      const { error: updateError } = await db
        .from('renewals')
        .update(update)
        .eq('id', String(current.id));
      if (updateError) return errResponse(updateError.message);

      await db.from('renewal_events').insert({
        renewal_id: String(current.id),
        member_id: memberId,
        from_status: previousStatus,
        to_status: nextStatus,
        reason: reason || null,
        actor_role: actorRole,
      });

      if (nextStatus === 'declined') {
        const targetAudience: string[] = ['role:mc'];
        if (memberTeam) targetAudience.push(`team:${memberTeam}`);
        await db.from('notifications').insert({
          type: 'renewal_declined',
          severity: 'urgent',
          title: `สมาชิกแจ้งไม่ต่ออายุ: ${String(memberRow.nickname || memberRow.name)}`,
          body: `${String(memberRow.name)} · ทีม ${memberTeam || 'ไม่มีทีม'}\nเหตุผล: ${reason}`,
          data: {
            memberId,
            memberName: String(memberRow.name),
            nickname: String(memberRow.nickname || ''),
            team: memberTeam,
            reason,
            actorRole,
          },
          target_audience: targetAudience,
        });
      }

      return jsonResponse({
        ok: true,
        status: nextStatus,
        previousStatus,
        newExpiry: update.expiry_date || current.expiry_date,
      });
    }

    case 'extendRenewal': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member } = await db.from('members').select('id').eq('name', memberName).maybeSingle();
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
