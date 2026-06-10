// FILE: 121.ts
// Handler: 121 — save121Log, get121Logs, getAll121Logs, get121Tracker
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handle121(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── save121Log ─────────────────────────────────────────────
    // Mentor logs a 1-2-1 meeting for a member.
    // Uses initiator_id = partner_id = member's own id (mentor is not in DB).
    case 'save121Log': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      const note       = String(p.note || p.notes || '').trim();
      const nextStep   = String(p.nextStep || p.outcome || '').trim();

      if (!memberName) return errResponse('memberName required');

      const { data: member, error: memberErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .single();
      if (memberErr || !member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const memberId = String((member as Record<string, unknown>).id);

      const { error } = await db.from('one_to_one_logs').insert({
        initiator_id: memberId,
        partner_id:   memberId,
        met_at:       new Date().toISOString(),
        notes:        note,
        outcome:      nextStep || null,
      });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, loggedAt: new Date().toISOString() });
    }

    // ── get121Logs ─────────────────────────────────────────────
    // Get all 1-2-1 logs for a single member (as initiator or partner).
    case 'get121Logs': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member, error: memberErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .single();
      if (memberErr || !member) return jsonResponse({ ok: true, logs: [] });

      const memberId = String((member as Record<string, unknown>).id);

      // Fetch logs where member is initiator
      const { data: asInitiator, error: e1 } = await db
        .from('one_to_one_logs')
        .select('id, initiator_id, partner_id, notes, outcome, met_at, created_at')
        .eq('initiator_id', memberId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (e1) return errResponse(e1.message);

      // Fetch logs where member is partner (exclude self-logs already captured above)
      const { data: asPartner, error: e2 } = await db
        .from('one_to_one_logs')
        .select('id, initiator_id, partner_id, notes, outcome, met_at, created_at')
        .eq('partner_id', memberId)
        .neq('initiator_id', memberId)   // avoid duplicating self-referencing rows
        .order('created_at', { ascending: false })
        .limit(100);
      if (e2) return errResponse(e2.message);

      type LogRow = {
        id: string;
        initiator_id: string;
        partner_id: string;
        notes: string | null;
        outcome: string | null;
        met_at: string | null;
        created_at: string;
      };

      const combined: LogRow[] = [
        ...((asInitiator as LogRow[]) || []),
        ...((asPartner   as LogRow[]) || []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const logs = combined.map((row) => ({
        id:        row.id,
        member:    memberName,
        partner:   memberName,  // self-referenced; partner name = same member
        note:      row.notes    ?? '',
        nextStep:  row.outcome  ?? '',
        loggedAt:  row.met_at   ?? row.created_at,
      }));

      return jsonResponse({ ok: true, logs });
    }

    // ── getAll121Logs ──────────────────────────────────────────
    // Chapter-wide 1-2-1 summary. MC/Growth only.
    case 'getAll121Logs': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      // Fetch all logs with member info (mentor_team via initiator)
      const { data, error } = await db
        .from('one_to_one_logs')
        .select(`
          id,
          notes,
          outcome,
          met_at,
          created_at,
          initiator:members!one_to_one_logs_initiator_id_fkey(name, nickname, mentor_team)
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return errResponse(error.message);

      const rows = (data || []) as Array<Record<string, unknown>>;
      const total = rows.length;

      // Count by team
      const byTeam: Record<string, number> = {};
      for (const row of rows) {
        const initiator = row.initiator as Record<string, unknown> | null;
        const team = String(initiator?.mentor_team || 'Unknown');
        byTeam[team] = (byTeam[team] || 0) + 1;
      }

      // 8 most recent
      const recent = rows.slice(0, 8).map((row) => {
        const initiator = row.initiator as Record<string, unknown> | null;
        return {
          team:      String(initiator?.mentor_team || ''),
          member:    String(initiator?.name        || ''),
          note:      String(row.notes              || ''),
          loggedAt:  String(row.met_at             || row.created_at || ''),
        };
      });

      return jsonResponse({ ok: true, total, byTeam, recent });
    }

    // ── get121Tracker ──────────────────────────────────────────
    // Full list with statistics: total, met, pending, gotRef, convRate.
    case 'get121Tracker': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('one_to_one_logs')
        .select(`
          id,
          notes,
          outcome,
          met_at,
          scheduled_date,
          created_at,
          initiator:members!one_to_one_logs_initiator_id_fkey(name, nickname, mentor_team),
          partner:members!one_to_one_logs_partner_id_fkey(name, nickname)
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return errResponse(error.message);

      const rows = (data || []) as Array<Record<string, unknown>>;

      let met     = 0;
      let pending = 0;
      let gotRef  = 0;

      const list = rows.map((row) => {
        const hasMet    = !!row.met_at;
        const outcomeStr = String(row.outcome || '');
        const hasRef    = /ref/i.test(outcomeStr);

        if (hasMet) met++;  else pending++;
        if (hasRef) gotRef++;

        const initiator = row.initiator as Record<string, unknown> | null;
        const partner   = row.partner   as Record<string, unknown> | null;

        return {
          id:            row.id,
          member:        String(initiator?.name        || ''),
          partner:       String(partner?.name          || ''),
          team:          String(initiator?.mentor_team || ''),
          note:          String(row.notes              || ''),
          nextStep:      outcomeStr,
          scheduledDate: row.scheduled_date ?? null,
          loggedAt:      String(row.met_at             || row.created_at || ''),
          met:           hasMet,
        };
      });

      const total    = rows.length;
      const convRate = total > 0 ? Math.round((gotRef / total) * 100) : 0;

      return jsonResponse({
        ok: true,
        list,
        stats: { total, met, pending, gotRef, convRate },
      });
    }

    default:
      return errResponse(`Unknown 121 action: ${action}`);
  }
}
