// Handler: alerts — getAlertCenter, dismissAlert, getTeamNotifs, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAlerts(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getAlertCenter': {
      // All authenticated roles can see alerts (badge count & notification panel).
      // Data is filtered server-side: MC sees all; mentors/growth see their team's issues only.
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const now = Date.now();
      const alerts: Record<string, unknown>[] = [];

      // Team filter: MC/growth see all; mentor roles see only their own team's alerts.
      const callerTeam = auth.isMC ? null : (auth.teamName || null);

      // ── 1. Stale open core issues (>= 14 days) ─────────────
      let issueQuery = db
        .from('core_issues')
        .select('id, member_id, mentor_team, opened_at, issue_text')
        .eq('status', 'open');
      if (callerTeam) issueQuery = issueQuery.eq('mentor_team', callerTeam);
      const { data: openIssues } = await issueQuery;

      for (const ci of (openIssues || []) as Record<string, unknown>[]) {
        const age = Math.floor((now - new Date(String(ci.opened_at)).getTime()) / 86400000);
        if (age < 14) continue;
        const { data: m } = await db.from('v_member_dashboard')
          .select('name, nickname, display_score, traffic_light').eq('id', String(ci.member_id)).single();
        if (!m) continue;
        const mv = m as Record<string, unknown>;
        alerts.push({
          type: 'stale_case', level: age >= 30 ? 'emergency' : 'warning',
          icon: '📋', team: ci.mentor_team, name: mv.name, nick: mv.nickname,
          tl: mv.traffic_light, score: mv.display_score,
          detail: `Core Issue ค้างมา ${age} วัน`, sortKey: age,
        });
      }

      // ── 2. Declining score streak + no Core Issue ──────────
      let memberQuery = db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light, open_core_issue')
        .eq('is_archived', false)
        .not('mentor_team', 'is', null);
      if (callerTeam) memberQuery = memberQuery.eq('mentor_team', callerTeam);
      const { data: members } = await memberQuery;

      const memberIds = (members || []).map((m: Record<string, unknown>) => String(m.id));
      const { data: allScores } = await db
        .from('monthly_scores')
        .select('member_id, score, year, month')
        .in('member_id', memberIds)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      const scoreMap: Record<string, number[]> = {};
      for (const s of (allScores || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!scoreMap[mid]) scoreMap[mid] = [];
        scoreMap[mid].push(Number(s.score));
      }

      for (const m of (members || []) as Record<string, unknown>[]) {
        if (m.open_core_issue) continue; // already has report
        const scores = scoreMap[String(m.id)] || [];
        if (scores.length < 3) continue;
        let streak = 0;
        for (let k = 0; k < scores.length - 1; k++) {
          if (scores[k] < scores[k + 1]) streak++;
          else break;
        }
        if (streak < 2) continue;
        alerts.push({
          type: 'no_report', level: streak >= 3 ? 'emergency' : 'warning',
          icon: '📉', team: m.mentor_team, name: m.name, nick: m.nickname,
          tl: m.traffic_light, score: m.display_score,
          detail: `คะแนนลด ${streak + 1} เดือนติด ยังไม่มี Core Issue`,
          sortKey: streak * 10,
        });
      }

      // ── 3. Renewal alerts (expiry within 45 days) ──────────
      const today = new Date().toISOString().split('T')[0];
      const in45  = new Date(now + 45 * 86400000).toISOString().split('T')[0];
      const { data: renewals } = await db
        .from('renewals')
        .select('member_id, expiry_date')
        .lte('expiry_date', in45)
        .gte('expiry_date', today);

      for (const r of (renewals || []) as Record<string, unknown>[]) {
        const diff = Math.floor((new Date(String(r.expiry_date)).getTime() - now) / 86400000);
        const { data: m } = await db.from('members').select('name, mentor_team').eq('id', String(r.member_id)).single();
        if (!m) continue;
        const mv = m as Record<string, unknown>;
        alerts.push({
          type: 'renewal', level: diff <= 7 ? 'emergency' : 'warning',
          icon: '💳', team: mv.mentor_team || '', name: mv.name, nick: '', tl: 'none', score: 0,
          detail: `Renewal อีก ${diff} วัน (${r.expiry_date})`, sortKey: 100 - diff,
        });
      }

      const levelOrder: Record<string, number> = { emergency: 0, warning: 1 };
      alerts.sort((a, b) => {
        const ld = (levelOrder[String(a.level)] || 1) - (levelOrder[String(b.level)] || 1);
        return ld !== 0 ? ld : Number(b.sortKey) - Number(a.sortKey);
      });

      return jsonResponse({ ok: true, alerts, total: alerts.length });
    }

    case 'dismissAlert':
      // Frontend handles snooze via localStorage
      return jsonResponse({ ok: true });

    case 'getDismissedAlerts':
      return jsonResponse({ ok: true, dismissed: {} });

    case 'getTeamNotifs':
      return jsonResponse({ ok: true, notifs: [] });

    case 'ackTeamNotifs':
      return jsonResponse({ ok: true });

    case 'getUnreadCounts':
      return jsonResponse({ ok: true, unread: {}, count: 0 });

    case 'getReports': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const teamFilter = typeof p.teamName === 'string' && p.teamName ? p.teamName : null;
      let q = db.from('core_issues')
        .select('id, member_id, mentor_team, issue_text, action_plan, mc_reply, replied_at, status, opened_at, closed_at')
        .order('opened_at', { ascending: false });
      if (teamFilter) q = q.eq('mentor_team', teamFilter);
      const { data: issues, error: iErr } = await q;
      if (iErr) return errResponse(iErr.message);

      const memberIds = [...new Set((issues || []).map((r: Record<string, unknown>) => String(r.member_id)))];
      const { data: mRows } = memberIds.length
        ? await db.from('members').select('id, name, nickname').in('id', memberIds)
        : { data: [] };
      const mMap: Record<string, Record<string, unknown>> = {};
      for (const m of (mRows || []) as Record<string, unknown>[]) mMap[String(m.id)] = m;

      const statusMap: Record<string, string> = { resolved: 'done', open: 'open', snoozed: 'snoozed' };
      const reports = (issues || []).map((r: Record<string, unknown>) => {
        const m = mMap[String(r.member_id)] || {};
        return {
          row:        String(r.id),
          team:       String(r.mentor_team || ''),
          memberName: String(m.name   || ''),
          nick:       String(m.nickname || ''),
          status:     statusMap[String(r.status)] || String(r.status),
          coreIssue:  String(r.issue_text  || ''),
          actionTaken: '',
          plan:       String(r.action_plan || ''),
          reply:      String(r.mc_reply || ''),
          repliedAt:  String(r.replied_at || ''),
          doneAt:     String(r.closed_at || ''),
          savedAt:    String(r.opened_at   || ''),
        };
      });
      return jsonResponse({ ok: true, reports });
    }

    case 'setReportStatus': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const row    = String(p.row || '').trim();
      const status = String(p.status || '');
      if (!row) return errResponse('row (issue id) required');

      const dbStatus: Record<string, string> = { done: 'resolved', reopened: 'open', open: 'open', resolved: 'resolved', snoozed: 'snoozed' };
      const newStatus = dbStatus[status] || 'open';
      const update: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'resolved') update.closed_at = new Date().toISOString();
      if (newStatus === 'open')     update.closed_at = null;

      const { error } = await db.from('core_issues').update(update).eq('id', row);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'saveReply': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const row   = String(p.row   || '').trim();
      const reply = String(p.reply || '').trim();
      if (!row)   return errResponse('row (issue id) required');
      if (!reply) return errResponse('reply text required');

      const { error } = await db.from('core_issues')
        .update({ mc_reply: reply, replied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown alerts action: ${action}`);
  }
}
